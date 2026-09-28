-- ==============================================================================
-- MIGRATION: 20260928000001_phase3_and_phase4.sql
-- Dashboard Keuangan Keluarga - Fungsi Agregasi Database, Saldo & Rekapitulasi
-- Zona Waktu: Asia/Jakarta (WIB), Minggu mulai Senin (ISODOW 1)
-- ==============================================================================

-- ==============================================================================
-- 1. FUNGSI: get_account_balances
-- Menghitung saldo riil tiap akun = initial_balance + transaksi reconciled
-- ==============================================================================
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
language sql
security definer
stable
set search_path = public
as $$
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
$$;

-- ==============================================================================
-- 2. FUNGSI: adjust_account_balance
-- Rekonsiliasi manual saldo akun dengan mencatat penyesuaian / initial balance
-- ==============================================================================
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
    -- Cek household dan owner akun
    select household_id, owner into v_household_id, v_owner
    from public.accounts
    where id = p_account_id;

    if not found then
        raise exception 'Akun tidak ditemukan';
    end if;

    -- Hitung saldo saat ini
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

    -- Masukkan transaksi penyesuaian berstatus 'reconciled'
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

-- ==============================================================================
-- 3. FUNGSI: get_financial_summary
-- Menghitung total pengeluaran, pemasukan, selisih, dan jumlah pending
-- ==============================================================================
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
language sql
security definer
stable
set search_path = public
as $$
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
$$;

-- ==============================================================================
-- 4. FUNGSI: get_category_expenses
-- Menghitung total pengeluaran per kategori (hanya reconciled & out) + ranking
-- ==============================================================================
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
language sql
security definer
stable
set search_path = public
as $$
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
$$;

-- ==============================================================================
-- 5. FUNGSI: get_daily_financial_trend
-- Menghitung agregasi harian timezone Asia/Jakarta (WIB) untuk grafik Recharts
-- ==============================================================================
create or replace function public.get_daily_financial_trend(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
returns table (
    period_date text, -- Format: 'YYYY-MM-DD'
    expense_amount numeric,
    income_amount numeric
)
language sql
security definer
stable
set search_path = public
as $$
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
$$;
