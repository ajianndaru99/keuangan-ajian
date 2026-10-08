-- ==============================================================================
-- Migration: 20261008000001_raw_notifications_update_policy.sql
-- Mengizinkan pengguna mengupdate raw_notifications milik household-nya
-- (untuk menandai validated_at saat diverifikasi atau diabaikan secara manual)
-- ==============================================================================

CREATE POLICY "Users can update their household's raw notifications"
    ON public.raw_notifications FOR UPDATE
    USING (household_id = public.get_current_user_household_id())
    WITH CHECK (household_id = public.get_current_user_household_id());
