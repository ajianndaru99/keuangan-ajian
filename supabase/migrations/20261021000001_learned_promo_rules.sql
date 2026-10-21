-- ==============================================================================
-- MIGRATION: 20261021000001_learned_promo_rules.sql
-- Tabel Aturan Pembelajaran Regex Adaptif (Closed-Loop Rule Learning)
-- Menyimpan pola kata kunci promo/iklan yang ditemukan oleh Gemini atau Pengguna
-- Disesuaikan 100% dengan skema public.households dan public.get_current_user_household_id()
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.learned_promo_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('gemini', 'user_manual')),
    sample_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_household_keyword UNIQUE (household_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_learned_promo_rules_household 
    ON public.learned_promo_rules(household_id);

CREATE INDEX IF NOT EXISTS idx_learned_promo_rules_keyword 
    ON public.learned_promo_rules(keyword);

-- RLS: Keamanan Multi-Tenant Berbasis household_id Supabase
ALTER TABLE public.learned_promo_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learned_promo_rules_select"
    ON public.learned_promo_rules
    FOR SELECT
    USING (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "learned_promo_rules_insert"
    ON public.learned_promo_rules
    FOR INSERT
    WITH CHECK (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "learned_promo_rules_update"
    ON public.learned_promo_rules
    FOR UPDATE
    USING (
        household_id = public.get_current_user_household_id()
    )
    WITH CHECK (
        household_id = public.get_current_user_household_id()
    );

CREATE POLICY "learned_promo_rules_delete"
    ON public.learned_promo_rules
    FOR DELETE
    USING (
        household_id = public.get_current_user_household_id()
    );
