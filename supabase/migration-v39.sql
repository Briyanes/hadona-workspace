-- ============================================
-- Migration v39: Auto-sync Contract → Clients
-- When contract data changes, automatically update
-- clients.contract_value, contract_start, contract_end
-- ============================================

-- ============================================
-- Function: sync_client_contract_summary
-- Recalculates MRR & dates from active contracts
-- and updates the clients table
-- ============================================
CREATE OR REPLACE FUNCTION sync_client_contract_summary(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_mrr NUMERIC := 0;
  v_earliest_start DATE;
  v_latest_end DATE;
BEGIN
  -- Calculate total MRR from all active services across all active contracts
  SELECT
    COALESCE(SUM(cs.monthly_fee), 0)
  INTO v_total_mrr
  FROM contract_services cs
  INNER JOIN client_contracts cc ON cs.contract_id = cc.id
  WHERE
    cc.client_id = p_client_id
    AND cc.status IN ('active', 'renewed')
    AND cs.status = 'active'
    AND (cs.effective_to IS NULL OR cs.effective_to >= CURRENT_DATE);

  -- Get earliest contract start date
  SELECT
    MIN(cc.start_date)
  INTO v_earliest_start
  FROM client_contracts cc
  WHERE
    cc.client_id = p_client_id
    AND cc.status IN ('active', 'renewed');

  -- Get latest contract end date
  SELECT
    MAX(cc.end_date)
  INTO v_latest_end
  FROM client_contracts cc
  WHERE
    cc.client_id = p_client_id
    AND cc.status IN ('active', 'renewed');

  -- Update clients table
  UPDATE clients
  SET
    contract_value = CASE
      WHEN v_total_mrr > 0 THEN v_total_mrr
      ELSE contract_value -- keep existing if no active services yet
    END,
    contract_start = v_earliest_start,
    contract_end = v_latest_end
  WHERE id = p_client_id;
END;
$$;

-- ============================================
-- Trigger: After INSERT/UPDATE/DELETE on contract_services
-- Auto-sync client summary when services change
-- ============================================

CREATE OR REPLACE FUNCTION trigger_sync_on_service_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  -- Determine client_id from the changed row
  IF (TG_OP = 'DELETE') THEN
    -- Get client_id from the deleted contract
    SELECT cc.client_id INTO v_client_id
    FROM client_contracts cc
    WHERE cc.id = OLD.contract_id;
  ELSE
    -- Get client_id from the new/updated contract
    SELECT cc.client_id INTO v_client_id
    FROM client_contracts cc
    WHERE cc.id = NEW.contract_id;
  END IF;

  -- Sync if we found a client
  IF v_client_id IS NOT NULL THEN
    PERFORM sync_client_contract_summary(v_client_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_on_service_insert
  AFTER INSERT ON contract_services
  FOR EACH ROW EXECUTE FUNCTION trigger_sync_on_service_change();

CREATE TRIGGER trg_sync_on_service_update
  AFTER UPDATE ON contract_services
  FOR EACH ROW EXECUTE FUNCTION trigger_sync_on_service_change();

CREATE TRIGGER trg_sync_on_service_delete
  AFTER DELETE ON contract_services
  FOR EACH ROW EXECUTE FUNCTION trigger_sync_on_service_change();

-- ============================================
-- Trigger: After INSERT/UPDATE/DELETE on client_contracts
-- Auto-sync when contract header changes
-- ============================================

CREATE OR REPLACE FUNCTION trigger_sync_on_contract_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_client_id := OLD.client_id;
  ELSE
    v_client_id := NEW.client_id;
  END IF;

  IF v_client_id IS NOT NULL THEN
    PERFORM sync_client_contract_summary(v_client_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_on_contract_insert
  AFTER INSERT ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION trigger_sync_on_contract_change();

CREATE TRIGGER trg_sync_on_contract_update
  AFTER UPDATE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION trigger_sync_on_contract_change();

CREATE TRIGGER trg_sync_on_contract_delete
  AFTER DELETE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION trigger_sync_on_contract_change();

-- ============================================
-- Backfill: Sync all existing clients
-- ============================================
SELECT 'Syncing existing clients...' as status;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM clients LOOP
    PERFORM sync_client_contract_summary(c.id);
  END LOOP;
END $$;

SELECT 'Migration v39 complete — auto-sync triggers active' as status;