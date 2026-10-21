-- Migration: Tambah kolom klasifikasi AI pada raw_notifications (Fase 6A)
-- ai_label: PENGELUARAN | PEMASUKAN | NOTIFIKASI | PROMO | RAGU
-- ai_confidence: rentang 0 - 100
-- ai_reason: alasan satu kalimat dari AI

ALTER TABLE public.raw_notifications
ADD COLUMN IF NOT EXISTS ai_label TEXT CHECK (ai_label IS NULL OR ai_label IN ('PENGELUARAN', 'PEMASUKAN', 'NOTIFIKASI', 'PROMO', 'RAGU')),
ADD COLUMN IF NOT EXISTS ai_confidence SMALLINT CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 100)),
ADD COLUMN IF NOT EXISTS ai_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_raw_notifications_ai_label ON public.raw_notifications(ai_label);
