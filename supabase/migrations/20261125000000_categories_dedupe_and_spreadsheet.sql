-- ==============================================================================
-- MIGRATION: 20261125000000_categories_dedupe_and_spreadsheet.sql
-- 1. Pemisahan kategori Makan Harian & Jajan (9 Pos Resmi + Pemasukan)
-- 2. Perlindungan anti-duplikat atomik via content_fingerprint & notification_ref
-- 3. Konfigurasi tampilan notifikasi utuh & integrasi Google Spreadsheet aman
-- ==============================================================================

-- 1. Kolom Pengaturan Aman pada tabel settings (dapat dibaca client UI secara read-only)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS show_full_notification_telegram BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS spreadsheet_id TEXT,
  ADD COLUMN IF NOT EXISTS spreadsheet_url TEXT,
  ADD COLUMN IF NOT EXISTS spreadsheet_owner_email TEXT,
  ADD COLUMN IF NOT EXISTS spreadsheet_auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS spreadsheet_last_synced_at TIMESTAMPTZ;

-- 2. Tabel Terisolasi untuk Kredensial/Webhook Rahasia Spreadsheet (Hanya diakses service_role)
CREATE TABLE IF NOT EXISTS public.spreadsheet_integrations (
  household_id UUID PRIMARY KEY,
  spreadsheet_id TEXT,
  sheet_name TEXT NOT NULL DEFAULT 'Transaksi',
  webhook_url TEXT,
  sync_secret TEXT,
  google_refresh_token TEXT,
  google_access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pasang FK ke households hanya jika tabel public.households tersedia di database
DO $$
BEGIN
  IF to_regclass('public.households') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'fk_spreadsheet_integrations_household'
     ) THEN
    ALTER TABLE public.spreadsheet_integrations
      ADD CONSTRAINT fk_spreadsheet_integrations_household
      FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.spreadsheet_integrations ENABLE ROW LEVEL SECURITY;
-- Sengaja tanpa policy SELECT/INSERT/UPDATE untuk role authenticated/anon (fail-closed, khusus service_role backend).

-- 3. Perlindungan Anti-Double Transaksi Atomik di tabel transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS notification_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_household_content_fp
  ON public.transactions(household_id, content_fingerprint)
  WHERE content_fingerprint IS NOT NULL AND status <> 'ignored';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_household_notif_ref
  ON public.transactions(household_id, account_id, notification_ref)
  WHERE notification_ref IS NOT NULL AND status <> 'ignored';

-- 4. Sinkronisasi & Pemisahan Kategori: Dapur, Makan Harian, Jajan, & Lainnya
DO $$
DECLARE
  hh RECORD;
  v_source_sql TEXT;
BEGIN
  IF to_regclass('public.households') IS NOT NULL THEN
    v_source_sql := 'SELECT id AS household_id FROM public.households';
  ELSIF to_regclass('public.profiles') IS NOT NULL THEN
    v_source_sql := 'SELECT DISTINCT household_id FROM public.profiles WHERE household_id IS NOT NULL';
  ELSIF to_regclass('public.categories') IS NOT NULL THEN
    v_source_sql := 'SELECT DISTINCT household_id FROM public.categories WHERE household_id IS NOT NULL';
  ELSE
    RETURN;
  END IF;

  FOR hh IN EXECUTE v_source_sql LOOP
    -- Ubah nama kategori lama 'Makan & Jajan' menjadi 'Makan Harian' jika 'Makan Harian' belum ada
    IF EXISTS (
      SELECT 1 FROM public.categories WHERE household_id = hh.household_id AND name = 'Makan & Jajan' AND type = 'expense'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.categories WHERE household_id = hh.household_id AND name = 'Makan Harian' AND type = 'expense'
    ) THEN
      UPDATE public.categories
      SET name = 'Makan Harian', sort_order = 2
      WHERE household_id = hh.household_id AND name = 'Makan & Jajan' AND type = 'expense';
    END IF;

    -- Pastikan seluruh 9 kategori pengeluaran + 1 pemasukan standar tersedia
    INSERT INTO public.categories (household_id, name, type, icon, sort_order)
    VALUES
      (hh.household_id, 'Belanja Dapur', 'expense', 'shopping-cart', 1),
      (hh.household_id, 'Makan Harian', 'expense', 'utensils', 2),
      (hh.household_id, 'Jajan', 'expense', 'coffee', 3),
      (hh.household_id, 'Transportasi/Bensin', 'expense', 'car', 4),
      (hh.household_id, 'Tagihan & Utilitas', 'expense', 'zap', 5),
      (hh.household_id, 'Kebutuhan Rumah', 'expense', 'home', 6),
      (hh.household_id, 'Jalan-jalan', 'expense', 'map-pin', 7),
      (hh.household_id, 'Keperluan Mendadak', 'expense', 'alert-circle', 8),
      (hh.household_id, 'Lainnya', 'expense', 'tag', 9),
      (hh.household_id, 'Gaji/Pemasukan', 'income', 'wallet', 10)
    ON CONFLICT (household_id, name, type) DO NOTHING;
  END LOOP;
END $$;
