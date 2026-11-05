-- ==============================================================================
-- MIGRATION: 20261105000000_sync_account_balance_trigger.sql
-- Trigger Database untuk Menjaga accounts.balance Selalu Sinkron Otomatis
-- Setiap kali ada transaksi berstatus 'reconciled' yang ditambah, diubah, atau dihapus
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_account_id UUID;
BEGIN
    v_account_id := COALESCE(NEW.account_id, OLD.account_id);
    
    IF v_account_id IS NOT NULL THEN
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
            WHERE t.account_id = v_account_id
              AND t.status = 'reconciled'
        ), 0)
        WHERE a.id = v_account_id;
    END IF;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_balance ON public.transactions;
CREATE TRIGGER trg_sync_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_account_balance();

