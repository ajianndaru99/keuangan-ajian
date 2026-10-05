-- ==============================================================================
-- MIGRATION: 20261005000000_security_fixes.sql
-- Penguatan Keamanan RLS, Validasi Household RPC, dan Pembatasan Izin Anon
-- ==============================================================================

-- 1. Penguatan Policy Update Profiles (mencegah manipulasi household_id dan role)
drop policy if exists "User dapat memperbarui profil miliknya sendiri" on public.profiles;

create policy "User dapat memperbarui profil miliknya sendiri"
    on public.profiles for update
    using (id = auth.uid())
    with check (
        id = auth.uid()
        and household_id = public.get_current_user_household_id()
        and role = public.get_current_user_role()
    );

-- 2. Validasi Otorisasi pada get_account_balances
create or replace function public.get_account_balances(p_household_id uuid)
returns table (
    account_id uuid,
    household_id uuid,
    name text,
    type text,
    owner text,
    initial_balance numeric,
    current_balance numeric,
    is_active boolean,
    reconciled_tx_count bigint
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if p_household_id is null or p_household_id != public.get_current_user_household_id() then
        raise exception 'Akses ditolak: bukan household pengguna saat ini';
    end if;

    return query
    select
        a.id as account_id,
        a.household_id,
        a.name,
        a.type,
        a.owner,
        a.initial_balance,
        (
            a.initial_balance + coalesce(
                sum(
                    case 
                        when t.direction = 'in' then t.amount 
                        when t.direction = 'out' then -t.amount 
                        else 0 
                    end
                ), 
                0
            )
        ) as current_balance,
        a.is_active,
        count(t.id) filter (where t.status = 'reconciled') as reconciled_tx_count
    from public.accounts a
    left join public.transactions t 
        on t.account_id = a.id 
        and t.status = 'reconciled'
    where a.household_id = p_household_id
    group by a.id, a.household_id, a.name, a.type, a.owner, a.initial_balance, a.is_active
    order by a.owner asc, a.type asc, a.name asc;
end;
$$;

revoke execute on function public.get_account_balances(uuid) from public, anon;
grant execute on function public.get_account_balances(uuid) to authenticated, service_role;

-- 3. Validasi Otorisasi pada adjust_account_balance
create or replace function public.adjust_account_balance(
    p_account_id uuid,
    p_target_balance numeric,
    p_notes text default 'Koreksi Saldo Manual'
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
    v_household_id uuid;
    v_current_balance numeric;
    v_owner text;
    v_diff numeric;
    v_direction text;
begin
    select household_id, owner into v_household_id, v_owner
    from public.accounts
    where id = p_account_id;

    if not found then
        raise exception 'Akun tidak ditemukan';
    end if;

    if v_household_id != public.get_current_user_household_id() then
        raise exception 'Akses ditolak: akun bukan milik household pengguna saat ini';
    end if;

    select current_balance into v_current_balance
    from public.get_account_balances(v_household_id)
    where account_id = p_account_id;

    v_diff := p_target_balance - coalesce(v_current_balance, 0);

    if v_diff = 0 then
        return p_target_balance;
    end if;

    if v_diff > 0 then
        v_direction := 'in';
    else
        v_direction := 'out';
    end if;

    insert into public.transactions (
        household_id,
        account_id,
        amount,
        direction,
        merchant,
        raw_notification,
        source_device,
        transaction_date,
        status,
        dedupe_hash,
        needs_review
    ) values (
        v_household_id,
        p_account_id,
        abs(v_diff),
        v_direction,
        p_notes,
        format('Penyesuaian saldo manual: %s (Selisih: %s)', p_notes, v_diff),
        v_owner,
        now(),
        'reconciled',
        format('adj_%s_%s', p_account_id, extract(epoch from now())),
        false
    );

    return p_target_balance;
end;
$$;

revoke execute on function public.adjust_account_balance(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_account_balance(uuid, numeric, text) to authenticated, service_role;

-- 4. Validasi Otorisasi pada get_financial_summary
create or replace function public.get_financial_summary(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
returns table (
    total_expense numeric,
    total_income numeric,
    net_difference numeric,
    pending_count bigint,
    pending_expense numeric,
    pending_income numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if p_household_id is null or p_household_id != public.get_current_user_household_id() then
        raise exception 'Akses ditolak: bukan household pengguna saat ini';
    end if;

    return query
    with filtered_tx as (
        select
            t.status,
            t.direction,
            t.amount
        from public.transactions t
        join public.accounts a on a.id = t.account_id
        where t.household_id = p_household_id
          and t.transaction_date >= p_start_date
          and t.transaction_date <= p_end_date
          and (p_owner is null or t.source_device = p_owner)
          and (p_account_id is null or t.account_id = p_account_id)
    )
    select
        coalesce(sum(amount) filter (where status = 'reconciled' and direction = 'out'), 0) as total_expense,
        coalesce(sum(amount) filter (where status = 'reconciled' and direction = 'in'), 0) as total_income,
        (
            coalesce(sum(amount) filter (where status = 'reconciled' and direction = 'in'), 0) -
            coalesce(sum(amount) filter (where status = 'reconciled' and direction = 'out'), 0)
        ) as net_difference,
        coalesce(count(*) filter (where status = 'pending'), 0) as pending_count,
        coalesce(sum(amount) filter (where status = 'pending' and direction = 'out'), 0) as pending_expense,
        coalesce(sum(amount) filter (where status = 'pending' and direction = 'in'), 0) as pending_income
    from filtered_tx;
end;
$$;

revoke execute on function public.get_financial_summary(uuid, timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.get_financial_summary(uuid, timestamptz, timestamptz, text, uuid) to authenticated, service_role;

-- 5. Validasi Otorisasi pada get_category_expenses
create or replace function public.get_category_expenses(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
returns table (
    category_id uuid,
    category_name text,
    category_icon text,
    total_amount numeric,
    percentage numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if p_household_id is null or p_household_id != public.get_current_user_household_id() then
        raise exception 'Akses ditolak: bukan household pengguna saat ini';
    end if;

    return query
    with cat_totals as (
        select
            coalesce(c.id, '00000000-0000-0000-0000-000000000000'::uuid) as cat_id,
            coalesce(c.name, 'Tanpa Kategori') as cat_name,
            coalesce(c.icon, 'tag') as cat_icon,
            sum(t.amount) as cat_amount
        from public.transactions t
        join public.accounts a on a.id = t.account_id
        left join public.categories c on c.id = t.category_id
        where t.household_id = p_household_id
          and t.status = 'reconciled'
          and t.direction = 'out'
          and t.transaction_date >= p_start_date
          and t.transaction_date <= p_end_date
          and (p_owner is null or t.source_device = p_owner)
          and (p_account_id is null or t.account_id = p_account_id)
        group by c.id, c.name, c.icon
    ),
    grand_total as (
        select coalesce(sum(cat_amount), 0) as total from cat_totals
    )
    select
        ct.cat_id as category_id,
        ct.cat_name as category_name,
        ct.cat_icon as category_icon,
        ct.cat_amount as total_amount,
        case 
            when gt.total > 0 then round((ct.cat_amount / gt.total) * 100, 1)
            else 0 
        end as percentage
    from cat_totals ct
    cross join grand_total gt
    order by ct.cat_amount desc;
end;
$$;

revoke execute on function public.get_category_expenses(uuid, timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.get_category_expenses(uuid, timestamptz, timestamptz, text, uuid) to authenticated, service_role;

-- 6. Validasi Otorisasi pada get_daily_financial_trend
create or replace function public.get_daily_financial_trend(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
returns table (
    period_date text,
    expense_amount numeric,
    income_amount numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
    if p_household_id is null or p_household_id != public.get_current_user_household_id() then
        raise exception 'Akses ditolak: bukan household pengguna saat ini';
    end if;

    return query
    select
        to_char(date_trunc('day', t.transaction_date at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') as period_date,
        coalesce(sum(case when t.direction = 'out' then t.amount else 0 end), 0) as expense_amount,
        coalesce(sum(case when t.direction = 'in' then t.amount else 0 end), 0) as income_amount
    from public.transactions t
    join public.accounts a on a.id = t.account_id
    where t.household_id = p_household_id
      and t.status = 'reconciled'
      and t.transaction_date >= p_start_date
      and t.transaction_date <= p_end_date
      and (p_owner is null or t.source_device = p_owner)
      and (p_account_id is null or t.account_id = p_account_id)
    group by date_trunc('day', t.transaction_date at time zone 'Asia/Jakarta')
    order by period_date asc;
end;
$$;

revoke execute on function public.get_daily_financial_trend(uuid, timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.get_daily_financial_trend(uuid, timestamptz, timestamptz, text, uuid) to authenticated, service_role;
