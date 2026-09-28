-- ==============================================================================
-- MIGRATION: 20260928000000_init_schema.sql
-- Dashboard Keuangan Keluarga - Skema Database & RLS Policy
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ==============================================================================
-- 2. TABEL: households
-- ==============================================================================
create table if not exists public.households (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

-- ==============================================================================
-- 3. TABEL: profiles (relasi 1-to-1 dengan auth.users)
-- ==============================================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    household_id uuid not null references public.households(id) on delete cascade,
    role text not null check (role in ('suami', 'istri')),
    display_name text not null,
    created_at timestamptz not null default now()
);

-- ==============================================================================
-- 4. TABEL: accounts (rekening bank & e-wallet)
-- ==============================================================================
create table if not exists public.accounts (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    owner text not null check (owner in ('suami', 'istri')),
    name text not null, -- contoh: 'BCA', 'Mandiri', 'BRI', 'GoPay', 'ShopeePay', 'DANA', 'OVO'
    type text not null check (type in ('bank', 'ewallet')),
    balance numeric not null default 0,
    initial_balance numeric not null default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    constraint uq_account_household_owner_name unique (household_id, owner, name)
);

-- ==============================================================================
-- 5. TABEL: categories (kategori pengeluaran & pemasukan)
-- ==============================================================================
create table if not exists public.categories (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    name text not null,
    type text not null check (type in ('expense', 'income')),
    icon text not null default 'tag',
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    constraint uq_category_household_name_type unique (household_id, name, type)
);

-- ==============================================================================
-- 6. TABEL: transactions (transaksi keuangan)
-- ==============================================================================
create table if not exists public.transactions (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    account_id uuid not null references public.accounts(id) on delete restrict,
    category_id uuid references public.categories(id) on delete set null,
    amount numeric not null default 0,
    direction text not null check (direction in ('out', 'in')),
    merchant text not null default '',
    raw_notification text not null,
    source_device text not null check (source_device in ('suami', 'istri')),
    transaction_date timestamptz not null, -- Waktu dari notifikasi, bukan created_at
    status text not null default 'pending' check (status in ('pending', 'reconciled', 'ignored')),
    dedupe_hash text unique not null,
    needs_review boolean not null default false,
    created_at timestamptz not null default now()
);

-- ==============================================================================
-- 7. TABEL: settings (pengaturan per household)
-- ==============================================================================
create table if not exists public.settings (
    household_id uuid primary key references public.households(id) on delete cascade,
    week_start integer not null default 1 check (week_start between 1 and 7), -- 1 = Senin
    month_start_day integer not null default 1 check (month_start_day between 1 and 28),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ==============================================================================
-- 8. INDEXES (Optimasi query inbox, filter, dan agregasi)
-- ==============================================================================
create index if not exists idx_profiles_household on public.profiles(household_id);
create index if not exists idx_accounts_household_owner on public.accounts(household_id, owner);
create index if not exists idx_categories_household on public.categories(household_id, type, sort_order);
create index if not exists idx_transactions_household_status on public.transactions(household_id, status);
create index if not exists idx_transactions_household_date on public.transactions(household_id, transaction_date desc);
create index if not exists idx_transactions_account on public.transactions(account_id);
create index if not exists idx_transactions_category on public.transactions(category_id);
create index if not exists idx_transactions_dedupe_hash on public.transactions(dedupe_hash);

-- ==============================================================================
-- 9. HELPER FUNCTIONS UNTUK ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Fungsi mendapatkan household_id pengguna saat ini dari profiles
create or replace function public.get_current_user_household_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid() limit 1;
$$;

-- Fungsi mendapatkan role ('suami' | 'istri') pengguna saat ini
create or replace function public.get_current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

-- ==============================================================================
-- 10. ENABLE ROW LEVEL SECURITY (RLS) DI SEMUA TABEL
-- ==============================================================================
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.settings enable row level security;

-- ==============================================================================
-- 11. RLS POLICIES
-- Aturan: User hanya dapat mengakses dan memodifikasi data milik household-nya
-- ==============================================================================

-- Policy: households
create policy "User dapat melihat household miliknya"
    on public.households for select
    using (id = public.get_current_user_household_id());

create policy "User dapat memperbarui data household miliknya"
    on public.households for update
    using (id = public.get_current_user_household_id());

-- Policy: profiles
create policy "User dapat melihat profil dalam household yang sama"
    on public.profiles for select
    using (household_id = public.get_current_user_household_id());

create policy "User dapat memperbarui profil miliknya sendiri"
    on public.profiles for update
    using (id = auth.uid());

-- Policy: accounts
create policy "User dapat melihat semua akun dalam household miliknya"
    on public.accounts for select
    using (household_id = public.get_current_user_household_id());

create policy "User dapat menambah akun baru untuk household miliknya"
    on public.accounts for insert
    with check (household_id = public.get_current_user_household_id());

create policy "User dapat mengedit akun dalam household miliknya"
    on public.accounts for update
    using (household_id = public.get_current_user_household_id());

create policy "User dapat menghapus akun dalam household miliknya"
    on public.accounts for delete
    using (household_id = public.get_current_user_household_id());

-- Policy: categories
create policy "User dapat melihat kategori dalam household miliknya"
    on public.categories for select
    using (household_id = public.get_current_user_household_id());

create policy "User dapat menambah kategori untuk household miliknya"
    on public.categories for insert
    with check (household_id = public.get_current_user_household_id());

create policy "User dapat mengedit kategori dalam household miliknya"
    on public.categories for update
    using (household_id = public.get_current_user_household_id());

create policy "User dapat menghapus kategori dalam household miliknya"
    on public.categories for delete
    using (household_id = public.get_current_user_household_id());

-- Policy: transactions
create policy "User dapat melihat transaksi dalam household miliknya"
    on public.transactions for select
    using (household_id = public.get_current_user_household_id());

create policy "User dapat menambah transaksi untuk household miliknya"
    on public.transactions for insert
    with check (household_id = public.get_current_user_household_id());

create policy "User dapat mengedit transaksi dalam household miliknya"
    on public.transactions for update
    using (household_id = public.get_current_user_household_id());

create policy "User dapat menghapus transaksi dalam household miliknya"
    on public.transactions for delete
    using (household_id = public.get_current_user_household_id());

-- Policy: settings
create policy "User dapat melihat pengaturan household miliknya"
    on public.settings for select
    using (household_id = public.get_current_user_household_id());

create policy "User dapat mengupdate pengaturan household miliknya"
    on public.settings for update
    using (household_id = public.get_current_user_household_id());

-- ==============================================================================
-- 12. SEED KATEGORI DAN PENGATURAN DEFAULT
-- ==============================================================================
create or replace function public.seed_default_categories(p_household_id uuid)
returns void as $$
begin
    insert into public.categories (household_id, name, type, icon, sort_order) values
        (p_household_id, 'Belanja Dapur', 'expense', 'shopping-cart', 1),
        (p_household_id, 'Makan & Jajan', 'expense', 'utensils', 2),
        (p_household_id, 'Transportasi/Bensin', 'expense', 'fuel', 3),
        (p_household_id, 'Tagihan & Utilitas', 'expense', 'zap', 4),
        (p_household_id, 'Anak', 'expense', 'baby', 5),
        (p_household_id, 'Kesehatan', 'expense', 'heart-pulse', 6),
        (p_household_id, 'Hiburan', 'expense', 'film', 7),
        (p_household_id, 'Belanja Online', 'expense', 'shopping-bag', 8),
        (p_household_id, 'Transfer Keluarga', 'expense', 'send', 9),
        (p_household_id, 'Lain-lain', 'expense', 'more-horizontal', 10),
        (p_household_id, 'Gaji/Pemasukan', 'income', 'wallet', 11)
    on conflict (household_id, name, type) do nothing;
end;
$$ language plpgsql security definer;

-- Trigger otomatis saat household baru dibuat: isi kategori & pengaturan default
create or replace function public.handle_new_household()
returns trigger as $$
begin
    perform public.seed_default_categories(new.id);
    insert into public.settings (household_id, week_start, month_start_day)
    values (new.id, 1, 1)
    on conflict (household_id) do nothing;
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_on_household_created on public.households;
create trigger trg_on_household_created
    after insert on public.households
    for each row execute function public.handle_new_household();

-- Aktifkan Realtime untuk tabel transactions (dibutuhkan di Fase 2)
alter publication supabase_realtime add table public.transactions;
