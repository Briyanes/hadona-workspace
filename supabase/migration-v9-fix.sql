-- ============================================
-- Migration V9 FIX: Redirect FK from auth.users → profiles
-- ============================================
-- Problem: timesheets.user_id & invoices.created_by referenced auth.users
--          but frontend joins to profiles. PostgREST can't resolve the
--          relationship without a direct FK to profiles.
-- Solution: Drop old FK constraints, add new ones pointing to profiles(id)
-- Safe: profiles.id == auth.users.id (1:1), no data loss.
-- ============================================

BEGIN;

-- 1. TIMESHEETS: user_id
-- Drop old constraint (auth.users)
ALTER TABLE public.timesheets
  DROP CONSTRAINT IF EXISTS timesheets_user_id_fkey;

-- Add new constraint (profiles)
ALTER TABLE public.timesheets
  ADD CONSTRAINT timesheets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. INVOICES: created_by
-- Drop old constraint (auth.users)
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;

-- Add new constraint (profiles)
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;

-- 3. Reload PostgREST schema cache so the new relationships are picked up
NOTIFY pgrst, 'reload schema';