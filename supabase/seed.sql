-- ==============================================================================
-- SEED SCRIPT: supabase/seed.sql
-- Inisialisasi household & akun awal untuk pengujian
-- ==============================================================================

do $$
declare
    v_household_id uuid;
begin
    -- 1. Buat Household Contoh jika belum ada
    select id into v_household_id from public.households where name = 'Keluarga Utama' limit 1;
    
    if v_household_id is null then
        insert into public.households (id, name)
        values (gen_random_uuid(), 'Keluarga Utama')
        returning id into v_household_id;
    end if;

    -- 2. Buat Akun Standar untuk Suami
    insert into public.accounts (household_id, owner, name, type, balance, initial_balance, is_active) values
        (v_household_id, 'suami', 'BCA', 'bank', 0, 0, true),
        (v_household_id, 'suami', 'Mandiri', 'bank', 0, 0, true),
        (v_household_id, 'suami', 'GoPay', 'ewallet', 0, 0, true),
        (v_household_id, 'suami', 'OVO', 'ewallet', 0, 0, true)
    on conflict (household_id, owner, name) do nothing;

    -- 3. Buat Akun Standar untuk Istri
    insert into public.accounts (household_id, owner, name, type, balance, initial_balance, is_active) values
        (v_household_id, 'istri', 'BCA', 'bank', 0, 0, true),
        (v_household_id, 'istri', 'BRI', 'bank', 0, 0, true),
        (v_household_id, 'istri', 'ShopeePay', 'ewallet', 0, 0, true),
        (v_household_id, 'istri', 'DANA', 'ewallet', 0, 0, true)
    on conflict (household_id, owner, name) do nothing;

    raise notice 'Seed data berhasil dipasang untuk Household ID: %', v_household_id;
end $$;
