-- Migration: Tambah kolom parse_method pada tabel transactions
-- Mencatat metode parsing asal transaksi: 'regex' (Layer 1), 'ai_gemini' (Layer 2), 'manual' (Layer 3), atau 'vision' (Struk Foto)

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS parse_method TEXT NOT NULL DEFAULT 'regex'
CHECK (parse_method IN ('regex', 'ai_gemini', 'manual', 'vision'));

-- Index untuk mempermudah filter/audit berdasarkan metode parsing
CREATE INDEX IF NOT EXISTS idx_transactions_parse_method ON public.transactions(parse_method);
