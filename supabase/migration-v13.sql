-- ============================================
-- Migration V13: Fix RLS - Allow all authenticated users to UPDATE ad_accounts
--
-- BUG: ad_accounts_write_manager only allows managers.
--      ad_accounts_update_pic only allows if pic_id = auth.uid().
--      Unassigned accounts (client_id NULL) have pic_id NULL too,
--      so staff users silently fail when bulk-assigning clients.
--
-- FIX: Allow all authenticated users to UPDATE ad_accounts (internal tool).
-- ============================================

BEGIN;

-- Drop the overly restrictive policies
DROP POLICY IF EXISTS "ad_accounts_write_manager" ON public.ad_accounts;
DROP POLICY IF EXISTS "ad_accounts_update_pic" ON public.ad_accounts;

-- Recreate: all authenticated users can read
CREATE POLICY "ad_accounts_select_all" ON public.ad_accounts
  FOR SELECT TO authenticated USING (true);

-- Recreate: all authenticated users can insert (for sheet import, sync, etc.)
CREATE POLICY "ad_accounts_insert_all" ON public.ad_accounts
  FOR INSERT TO authenticated WITH CHECK (true);

-- Recreate: all authenticated users can update (bulk assign, edit, etc.)
CREATE POLICY "ad_accounts_update_all" ON public.ad_accounts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Recreate: managers can delete
CREATE POLICY "ad_accounts_delete_manager" ON public.ad_accounts
  FOR DELETE TO authenticated USING (public.is_manager());

COMMIT;

-- ============================================
-- Also fix: clients table - allow all authenticated to INSERT/UPDATE
-- (needed for auto-assign-from-sheet feature to create new clients)
-- ============================================

BEGIN;

DROP POLICY IF EXISTS "clients_write_manager" ON public.clients;

-- All authenticated users can read
CREATE POLICY "clients_select_all" ON public.clients
  FOR SELECT TO authenticated USING (true);

-- All authenticated users can insert (auto-assign creates new clients)
CREATE POLICY "clients_insert_all" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (true);

-- All authenticated users can update
CREATE POLICY "clients_update_all" ON public.clients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Managers can delete
CREATE POLICY "clients_delete_manager" ON public.clients
  FOR DELETE TO authenticated USING (public.is_manager());

COMMIT;