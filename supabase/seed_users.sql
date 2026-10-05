-- ==============================================================================
-- SEED SCRIPT: supabase/seed_users.sql
-- Membuat Akun Pengguna Supabase Auth & Profil Suami-Istri
-- Password default: password123
-- ==============================================================================

do $$
declare
    v_household_id uuid;
    v_suami_id uuid := gen_random_uuid();
    v_istri_id uuid := gen_random_uuid();
begin
    -- 1. Ambil atau buat Household Utama
    select id into v_household_id from public.households where name = 'Keluarga Utama' limit 1;
    if v_household_id is null then
        insert into public.households (id, name)
        values (gen_random_uuid(), 'Keluarga Utama')
        returning id into v_household_id;
    end if;

    -- 2. Buat Pengguna Auth: Suami (suami@keluarga.com / password123)
    if not exists (select 1 from auth.users where email = 'suami@keluarga.com') then
        insert into auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) values (
            v_suami_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'suami@keluarga.com',
            crypt('password123', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"display_name":"Suami"}',
            now(),
            now()
        );

        insert into public.profiles (id, household_id, role, display_name)
        values (v_suami_id, v_household_id, 'suami', 'Suami')
        on conflict (id) do nothing;
    end if;

    -- 3. Buat Pengguna Auth: Istri (istri@keluarga.com / password123)
    if not exists (select 1 from auth.users where email = 'istri@keluarga.com') then
        insert into auth.users (
            id,
            instance_id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) values (
            v_istri_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'istri@keluarga.com',
            crypt('password123', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{"display_name":"Istri"}',
            now(),
            now()
        );

        insert into public.profiles (id, household_id, role, display_name)
        values (v_istri_id, v_household_id, 'istri', 'Istri')
        on conflict (id) do nothing;
    end if;

    raise notice 'Akun Suami dan Istri berhasil dibuat untuk Household ID: %', v_household_id;
end $$;
