-- ============================================
-- Migration v40: Fix Contract RLS Policies
-- Restrict INSERT/UPDATE/DELETE to admin/PM/account_executive
-- ============================================

-- Drop permisif policies dari v38
DROP POLICY IF EXISTS "contracts_insert_auth" ON client_contracts;
DROP POLICY IF EXISTS "contracts_update_auth" ON client_contracts;
DROP POLICY IF EXISTS "contracts_delete_auth" ON client_contracts;

DROP POLICY IF EXISTS "cservices_insert_auth" ON contract_services;
DROP POLICY IF EXISTS "cservices_update_auth" ON contract_services;
DROP POLICY IF EXISTS "cservices_delete_auth" ON contract_services;

DROP POLICY IF EXISTS "billings_insert_auth" ON contract_billings;
DROP POLICY IF EXISTS "billings_update_auth" ON contract_billings;
DROP POLICY IF EXISTS "billings_delete_auth" ON contract_billings;

-- Helper function: check if current user can manage contracts
-- Allowed: super_admin, project_manager, account_executive
CREATE OR REPLACE FUNCTION public.can_manage_contracts()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'project_manager', 'account_executive')
  );
$$;

-- ════════════════════════════════════════
-- client_contracts: SELECT all, modify restricted
-- ════════════════════════════════════════
CREATE POLICY "contracts_insert_restricted" ON client_contracts
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_contracts());

CREATE POLICY "contracts_update_restricted" ON client_contracts
  FOR UPDATE TO authenticated
  USING (public.can_manage_contracts())
  WITH CHECK (public.can_manage_contracts());

CREATE POLICY "contracts_delete_restricted" ON client_contracts
  FOR DELETE TO authenticated USING (public.can_manage_contracts());

-- ════════════════════════════════════════
-- contract_services: SELECT all, modify restricted
-- ════════════════════════════════════════
CREATE POLICY "cservices_insert_restricted" ON contract_services
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_contracts());

CREATE POLICY "cservices_update_restricted" ON contract_services
  FOR UPDATE TO authenticated
  USING (public.can_manage_contracts())
  WITH CHECK (public.can_manage_contracts());

CREATE POLICY "cservices_delete_restricted" ON contract_services
  FOR DELETE TO authenticated USING (public.can_manage_contracts());

-- ════════════════════════════════════════
-- contract_billings: SELECT all, modify restricted
-- ════════════════════════════════════════
CREATE POLICY "billings_insert_restricted" ON contract_billings
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_contracts());

CREATE POLICY "billings_update_restricted" ON contract_billings
  FOR UPDATE TO authenticated
  USING (public.can_manage_contracts())
  WITH CHECK (public.can_manage_contracts());

CREATE POLICY "billings_delete_restricted" ON contract_billings
  FOR DELETE TO authenticated USING (public.can_manage_contracts());

-- Grant execute on helper function
GRANT EXECUTE ON FUNCTION public.can_manage_contracts() TO authenticated;