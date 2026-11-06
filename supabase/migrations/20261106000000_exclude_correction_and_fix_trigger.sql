-- ==============================================================================
-- MIGRATION: 20261106000000_exclude_correction_and_fix_trigger.sql
-- 1. Kecualikan Koreksi Saldo & Transfer Internal dari RPC Rekap Dashboard Web
-- 2. Perbaiki Trigger sync_account_balance saat perpindahan rekening (UPDATE account_id)
-- ==============================================================================

-- 1. Perbarui get_financial_summary: kecualikan Koreksi Saldo & Transfer Internal
CREATE OR REPLACE FUNCTION public.get_financial_summary(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
RETURNS TABLE (
    total_expense numeric,
    total_income numeric,
    net_difference numeric,
    pending_count bigint,
    pending_expense numeric,
    pending_income numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF p_household_id IS NULL OR p_household_id != public.get_current_user_household_id() THEN
        RAISE EXCEPTION 'Akses ditolak: bukan household pengguna saat ini';
    END IF;

    RETURN QUERY
    WITH filtered_tx AS (
        SELECT
            t.status,
            t.direction,
            t.amount
        FROM public.transactions t
        JOIN public.accounts a ON a.id = t.account_id
        WHERE t.household_id = p_household_id
          AND t.transaction_date >= p_start_date
          AND t.transaction_date <= p_end_date
          AND (p_owner IS NULL OR t.source_device = p_owner)
          AND (p_account_id IS NULL OR t.account_id = p_account_id)
          AND t.merchant NOT ILIKE 'Koreksi Saldo:%'
          AND t.merchant NOT ILIKE 'Transfer Internal:%'
    )
    SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'reconciled' AND direction = 'out'), 0) AS total_expense,
        COALESCE(SUM(amount) FILTER (WHERE status = 'reconciled' AND direction = 'in'), 0) AS total_income,
        (
            COALESCE(SUM(amount) FILTER (WHERE status = 'reconciled' AND direction = 'in'), 0) -
            COALESCE(SUM(amount) FILTER (WHERE status = 'reconciled' AND direction = 'out'), 0)
        ) AS net_difference,
        COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0) AS pending_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND direction = 'out'), 0) AS pending_expense,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending' AND direction = 'in'), 0) AS pending_income
    FROM filtered_tx;
END;
$$;

-- 2. Perbarui get_category_expenses: kecualikan Koreksi Saldo & Transfer Internal
CREATE OR REPLACE FUNCTION public.get_category_expenses(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
RETURNS TABLE (
    category_id uuid,
    category_name text,
    category_icon text,
    total_amount numeric,
    percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF p_household_id IS NULL OR p_household_id != public.get_current_user_household_id() THEN
        RAISE EXCEPTION 'Akses ditolak: bukan household pengguna saat ini';
    END IF;

    RETURN QUERY
    WITH cat_totals AS (
        SELECT
            COALESCE(c.id, '00000000-0000-0000-0000-000000000000'::uuid) AS cat_id,
            COALESCE(c.name, 'Tanpa Kategori') AS cat_name,
            COALESCE(c.icon, 'tag') AS cat_icon,
            SUM(t.amount) AS cat_amount
        FROM public.transactions t
        JOIN public.accounts a ON a.id = t.account_id
        LEFT JOIN public.categories c ON c.id = t.category_id
        WHERE t.household_id = p_household_id
          AND t.status = 'reconciled'
          AND t.direction = 'out'
          AND t.transaction_date >= p_start_date
          AND t.transaction_date <= p_end_date
          AND (p_owner IS NULL OR t.source_device = p_owner)
          AND (p_account_id IS NULL OR t.account_id = p_account_id)
          AND t.merchant NOT ILIKE 'Koreksi Saldo:%'
          AND t.merchant NOT ILIKE 'Transfer Internal:%'
        GROUP BY c.id, c.name, c.icon
    ),
    grand_total AS (
        SELECT COALESCE(SUM(cat_amount), 0) AS total FROM cat_totals
    )
    SELECT
        ct.cat_id AS category_id,
        ct.cat_name AS category_name,
        ct.cat_icon AS category_icon,
        ct.cat_amount AS total_amount,
        CASE 
            WHEN gt.total > 0 THEN ROUND((ct.cat_amount / gt.total) * 100, 1)
            ELSE 0 
        END AS percentage
    FROM cat_totals ct
    CROSS JOIN grand_total gt
    ORDER BY ct.cat_amount DESC;
END;
$$;

-- 3. Perbarui get_daily_financial_trend: kecualikan Koreksi Saldo & Transfer Internal
CREATE OR REPLACE FUNCTION public.get_daily_financial_trend(
    p_household_id uuid,
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_owner text default null,
    p_account_id uuid default null
)
RETURNS TABLE (
    period_date text,
    expense_amount numeric,
    income_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    IF p_household_id IS NULL OR p_household_id != public.get_current_user_household_id() THEN
        RAISE EXCEPTION 'Akses ditolak: bukan household pengguna saat ini';
    END IF;

    RETURN QUERY
    SELECT
        to_char(date_trunc('day', t.transaction_date at time zone 'Asia/Jakarta'), 'YYYY-MM-DD') AS period_date,
        COALESCE(SUM(CASE WHEN t.direction = 'out' THEN t.amount ELSE 0 END), 0) AS expense_amount,
        COALESCE(SUM(CASE WHEN t.direction = 'in' THEN t.amount ELSE 0 END), 0) AS income_amount
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    WHERE t.household_id = p_household_id
      AND t.status = 'reconciled'
      AND t.transaction_date >= p_start_date
      AND t.transaction_date <= p_end_date
      AND (p_owner IS NULL OR t.source_device = p_owner)
      AND (p_account_id IS NULL OR t.account_id = p_account_id)
      AND t.merchant NOT ILIKE 'Koreksi Saldo:%'
      AND t.merchant NOT ILIKE 'Transfer Internal:%'
    GROUP BY date_trunc('day', t.transaction_date at time zone 'Asia/Jakarta')
    ORDER BY period_date ASC;
END;
$$;

-- 4. Perbarui Trigger sync_account_balance untuk menyinkronkan kedua akun saat UPDATE account_id
CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Jika operasi UPDATE dan account_id berpindah, sinkronkan akun lama
    IF TG_OP = 'UPDATE' AND OLD.account_id IS DISTINCT FROM NEW.account_id AND OLD.account_id IS NOT NULL THEN
        UPDATE public.accounts a
        SET balance = a.initial_balance + COALESCE((
            SELECT SUM(
                CASE 
                    WHEN t.direction = 'in' THEN t.amount
                    WHEN t.direction = 'out' THEN -t.amount
                    ELSE 0
                END
            )
            FROM public.transactions t
            WHERE t.account_id = OLD.account_id
              AND t.status = 'reconciled'
        ), 0)
        WHERE a.id = OLD.account_id;
    END IF;

    -- Sinkronkan akun saat ini / baru
    IF COALESCE(NEW.account_id, OLD.account_id) IS NOT NULL THEN
        UPDATE public.accounts a
        SET balance = a.initial_balance + COALESCE((
            SELECT SUM(
                CASE 
                    WHEN t.direction = 'in' THEN t.amount
                    WHEN t.direction = 'out' THEN -t.amount
                    ELSE 0
                END
            )
            FROM public.transactions t
            WHERE t.account_id = COALESCE(NEW.account_id, OLD.account_id)
              AND t.status = 'reconciled'
        ), 0)
        WHERE a.id = COALESCE(NEW.account_id, OLD.account_id);
    END IF;

    RETURN NULL;
END;
$$;
