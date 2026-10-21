-- ==============================================================================
-- MIGRATION: 20261021000000_ai_reconciliation_logs.sql
-- Tabel audit dan pencatat kuota Rekonsiliasi AI Harian (Maksimal 2x per hari)
-- ==============================================================================

create table if not exists public.ai_reconciliation_logs (
    id uuid primary key default gen_random_uuid(),
    household_id uuid not null references public.households(id) on delete cascade,
    reconciled_date date not null default (current_timestamp at time zone 'Asia/Jakarta')::date,
    trigger_type text not null check (trigger_type in ('manual', 'cron')),
    processed_count integer not null default 0,
    paired_transfers_count integer not null default 0,
    duplicates_count integer not null default 0,
    reconciled_count integer not null default 0,
    summary_notes text,
    created_at timestamptz not null default now()
);

-- Index komposit untuk query cek kuota per hari (Asia/Jakarta)
create index if not exists idx_ai_reconciliation_quota 
on public.ai_reconciliation_logs(household_id, reconciled_date);

-- Aktifkan Row Level Security (RLS)
alter table public.ai_reconciliation_logs enable row level security;

-- Policy RLS
create policy "ai_reconciliation_logs_select"
on public.ai_reconciliation_logs for select
using (
  household_id = public.get_current_user_household_id()
);

create policy "ai_reconciliation_logs_insert"
on public.ai_reconciliation_logs for insert
with check (
  household_id = public.get_current_user_household_id()
);
