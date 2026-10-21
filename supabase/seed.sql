-- ==============================================================================
-- SEED SCRIPT: supabase/seed.sql
-- Inisialisasi household & akun awal: Cukup Dana Suami dan Dana Istri
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

    -- 2. Buat Akun Standar untuk Suami (Dana Suami)
    insert into public.accounts (household_id, owner, name, type, balance, initial_balance, is_active) values
        (v_household_id, 'suami', 'Dana Suami', 'bank', 0, 0, true)
    on conflict (household_id, owner, name) do nothing;

    -- 3. Buat Akun Standar untuk Istri (Dana Istri)
    insert into public.accounts (household_id, owner, name, type, balance, initial_balance, is_active) values
        (v_household_id, 'istri', 'Dana Istri', 'bank', 0, 0, true)
    on conflict (household_id, owner, name) do nothing;

    raise notice 'Seed data berhasil dipasang untuk Household ID: %', v_household_id;
end $$;
