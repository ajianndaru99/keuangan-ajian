-- ==============================================================================
-- MIGRATION: 20261104000000_add_notes_and_telegram_source.sql
-- Menambahkan kolom notes pada tabel transactions dan memperluas check constraint source_device
-- ==============================================================================

-- 1. Tambah kolom notes untuk alasan pembatalan / penolakan / catatan manual transaksi
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Perbarui check constraint source_device untuk mendukung sumber 'telegram' selain 'suami' dan 'istri'
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_source_device_check;

ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_source_device_check 
CHECK (source_device IN ('suami', 'istri', 'telegram'));

