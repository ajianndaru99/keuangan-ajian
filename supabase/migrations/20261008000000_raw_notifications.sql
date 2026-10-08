-- Migration untuk tabel raw_notifications (Fase 0)

CREATE TABLE IF NOT EXISTS public.raw_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'notification' CHECK (source IN ('notification', 'screenshot', 'csv')),
    app_name TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) <= 2000),
    
    received_at_raw TEXT, -- Nilai mentah dari perangkat
    received_at BIGINT, -- Parsed epoch ms. Bisa null jika format tidak dikenali.
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Hasil Parser On-the-fly
    outcome TEXT,
    reasons TEXT[],
    parser_version TEXT,
    sensitive BOOLEAN DEFAULT FALSE,
    validated_at TIMESTAMPTZ, -- Untuk flag retensi
    
    -- Deduplikasi mentah (mencegah data ganda identik)
    content_hash TEXT GENERATED ALWAYS AS (md5(title || chr(10) || content)) STORED,
    CONSTRAINT uq_raw_notification_hash UNIQUE (device_id, app_name, received_at_raw, content_hash)
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_raw_notifications_household ON public.raw_notifications(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_notifications_dedupe ON public.raw_notifications(device_id, app_name, received_at);

-- Row Level Security
ALTER TABLE public.raw_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their household's raw notifications"
    ON public.raw_notifications FOR SELECT
    USING (household_id = public.get_current_user_household_id());

CREATE POLICY "Users can delete their household's raw notifications"
    ON public.raw_notifications FOR DELETE
    USING (household_id = public.get_current_user_household_id());

-- Fungsi Retensi: Membersihkan notifikasi mentah yang sudah tervalidasi setelah N hari (default 30 hari)
-- atau data mentah lampau setelah 90 hari
CREATE OR REPLACE FUNCTION public.cleanup_old_raw_notifications(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.raw_notifications
    WHERE (validated_at IS NOT NULL AND validated_at < NOW() - (retention_days || ' days')::INTERVAL)
       OR (created_at < NOW() - ((retention_days * 3) || ' days')::INTERVAL);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- View Agregasi Redaksi Harian untuk mengukur persentase tangkapan Fase 0 tanpa menyimpan isi sensitif
CREATE OR REPLACE VIEW public.v_daily_redacted_notification_stats AS
SELECT 
    household_id,
    device_id,
    app_name,
    DATE(created_at AT TIME ZONE 'Asia/Jakarta') AS log_date,
    COUNT(*) FILTER (WHERE sensitive = TRUE) AS redacted_count,
    COUNT(*) AS total_count
FROM public.raw_notifications
GROUP BY household_id, device_id, app_name, DATE(created_at AT TIME ZONE 'Asia/Jakarta');
