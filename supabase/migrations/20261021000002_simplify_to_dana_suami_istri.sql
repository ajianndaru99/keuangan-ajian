-- ==============================================================================
-- MIGRATION: 20261021000002_simplify_to_dana_suami_istri.sql
-- Menyederhanakan seluruh akun bank/e-wallet menjadi cukup 2 akun:
-- 1. "Dana Suami" (Akun Utama Kepala Keluarga)
-- 2. "Dana Istri" (Akun Utama Bendahara Istri)
-- Mengalihkan seluruh referensi transaksi lama agar data tidak hilang.
-- ==============================================================================

do $$
declare
    v_household_id uuid;
    v_acc_suami_id uuid;
    v_acc_istri_id uuid;
    v_total_suami numeric := 0;
    v_total_istri numeric := 0;
begin
    -- 1. Ambil household_id keluarga utama
    select id into v_household_id from public.households order by created_at asc limit 1;
    if v_household_id is null then
        raise notice 'Household tidak ditemukan. Lewati migrasi.';
        return;
    end if;

    -- 2. Hitung total saldo awal dari akun-akun lama suami & istri
    select coalesce(sum(coalesce(initial_balance, balance, 0)), 0)
    into v_total_suami
    from public.accounts
    where household_id = v_household_id and owner = 'suami' and name not in ('Dana Suami');

    select coalesce(sum(coalesce(initial_balance, balance, 0)), 0)
    into v_total_istri
    from public.accounts
    where household_id = v_household_id and owner = 'istri' and name not in ('Dana Istri');

    -- Jika total saldo awal sebelumnya 0, berikan nilai default wajar
    if v_total_suami = 0 then
        v_total_suami := 8946000;
    end if;
    if v_total_istri = 0 then
        v_total_istri := 7700000;
    end if;

    -- 3. Buat atau perbarui akun "Dana Suami"
    insert into public.accounts (household_id, owner, name, type, balance, initial_balance, is_active)
    values (v_household_id, 'suami', 'Dana Suami', 'bank', v_total_suami, v_total_suami, true)
    on conflict (household_id, owner, name) do update
        set is_active = true,
            initial_balance = excluded.initial_balance,
            balance = excluded.balance
    returning id into v_acc_suami_id;

    if v_acc_suami_id is null then
        select id into v_acc_suami_id from public.accounts
        where household_id = v_household_id and owner = 'suami' and name = 'Dana Suami' limit 1;
    end if;

    -- 4. Buat atau perbarui akun "Dana Istri"
    insert into public.accounts (household_id, owner, name, type, balance, initial_balance, is_active)
    values (v_household_id, 'istri', 'Dana Istri', 'bank', v_total_istri, v_total_istri, true)
    on conflict (household_id, owner, name) do update
        set is_active = true,
            initial_balance = excluded.initial_balance,
            balance = excluded.balance
    returning id into v_acc_istri_id;

    if v_acc_istri_id is null then
        select id into v_acc_istri_id from public.accounts
        where household_id = v_household_id and owner = 'istri' and name = 'Dana Istri' limit 1;
    end if;

    -- 5. Alihkan seluruh riwayat transaksi lama ke akun yang baru (agar tidak melanggar foreign key constraint)
    -- Transaksi Suami dialihkan ke Dana Suami
    update public.transactions t
    set account_id = v_acc_suami_id
    from public.accounts a
    where t.account_id = a.id and a.owner = 'suami' and a.id <> v_acc_suami_id;

    -- Transaksi Istri dialihkan ke Dana Istri
    update public.transactions t
    set account_id = v_acc_istri_id
    from public.accounts a
    where t.account_id = a.id and a.owner = 'istri' and a.id <> v_acc_istri_id;

    -- Fallback jika ada transaksi yang tercatat lewat source_device
    update public.transactions
    set account_id = v_acc_suami_id
    where source_device = 'suami' and account_id <> v_acc_suami_id and account_id not in (v_acc_suami_id, v_acc_istri_id);

    update public.transactions
    set account_id = v_acc_istri_id
    where source_device = 'istri' and account_id <> v_acc_istri_id and account_id not in (v_acc_suami_id, v_acc_istri_id);

    -- 6. Hapus seluruh akun lama selain "Dana Suami" dan "Dana Istri"
    delete from public.accounts
    where household_id = v_household_id and id not in (v_acc_suami_id, v_acc_istri_id);

    raise notice 'Migrasi Selesai: Akun disederhanakan menjadi Dana Suami (%) dan Dana Istri (%)', v_acc_suami_id, v_acc_istri_id;
end $$;
