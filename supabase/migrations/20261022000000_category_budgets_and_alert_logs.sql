-- ==============================================================================
-- MIGRATION: 20261022000000_category_budgets_and_alert_logs.sql
-- Tabel Penyimpanan Batas Anggaran Kategori & Log Peredam Spam Notifikasi
-- ==============================================================================

-- 1. TABEL: category_budgets
CREATE TABLE IF NOT EXISTS public.category_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL, -- contoh: 'b-dapur', 'b-makan', dll
    category_name TEXT NOT NULL, -- contoh: 'Belanja Dapur', 'Makan & Jajan', dll
    limit_amount NUMERIC NOT NULL DEFAULT 0,
    period_month TEXT NOT NULL, -- format 'YYYY-MM'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_category_budget_household_cat_month UNIQUE (household_id, category_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_household_month 
    ON public.category_budgets(household_id, period_month);

-- RLS: category_budgets
ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_budgets_select"
    ON public.category_budgets
    FOR SELECT
    USING (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "category_budgets_insert"
    ON public.category_budgets
    FOR INSERT
    WITH CHECK (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "category_budgets_update"
    ON public.category_budgets
    FOR UPDATE
    USING (
        household_id = public.get_current_user_household_id()
    )
    WITH CHECK (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "category_budgets_delete"
    ON public.category_budgets
    FOR DELETE
    USING (
        household_id = public.get_current_user_household_id()
    );

-- 2. TABEL: notification_alert_logs (Peredam Spam Alert)
CREATE TABLE IF NOT EXISTS public.notification_alert_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('budget_warning', 'budget_exceeded', 'review_needed')),
    category_id TEXT,
    period_month TEXT, -- format 'YYYY-MM'
    level TEXT, -- '80', '100' untuk budget
    message TEXT NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_alert_log_household_type_cat_month_lvl UNIQUE (household_id, alert_type, category_id, period_month, level)
);

CREATE INDEX IF NOT EXISTS idx_alert_logs_lookup 
    ON public.notification_alert_logs(household_id, alert_type, period_month);

-- RLS: notification_alert_logs
ALTER TABLE public.notification_alert_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_logs_select"
    ON public.notification_alert_logs
    FOR SELECT
    USING (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "alert_logs_insert"
    ON public.notification_alert_logs
    FOR INSERT
    WITH CHECK (
        household_id = public.get_current_user_household_id()
    );
