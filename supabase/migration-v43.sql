-- Migration v43: Auto-sync contract_value from contract_services + helper functions
-- Fixes MRR calculation to use real contract data instead of manual estimate

-- ============================================
-- Function: get_client_mrr(p_client_id)
-- Returns real monthly recurring revenue from active contract_services
-- ============================================
CREATE OR REPLACE FUNCTION get_client_mrr(p_client_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_mrr NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(cs.monthly_fee), 0)
  INTO total_mrr
  FROM contract_services cs
  INNER JOIN client_contracts cc ON cs.contract_id = cc.id
  WHERE cc.client_id = p_client_id
    AND cc.status = 'active'
    AND cs.status = 'active'
    AND (cs.effective_to IS NULL OR cs.effective_to >= CURRENT_DATE);
  
  RETURN total_mrr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Function: get_client_outstanding(p_client_id)
-- Returns total unpaid/overdue billing amount
-- ============================================
CREATE OR REPLACE FUNCTION get_client_outstanding(p_client_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_outstanding NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(cb.grand_total), 0)
  INTO total_outstanding
  FROM contract_billings cb
  INNER JOIN client_contracts cc ON cb.contract_id = cc.id
  WHERE cc.client_id = p_client_id
    AND cb.status IN ('unpaid', 'overdue');
  
  RETURN total_outstanding;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- View: client_financial_summary
-- Aggregates MRR, outstanding, paid this month per client
-- ============================================
CREATE OR REPLACE VIEW client_financial_summary AS
SELECT 
  c.id as client_id,
  c.name,
  c.status,
  -- Real MRR from contract_services
  COALESCE((
    SELECT SUM(cs.monthly_fee)
    FROM contract_services cs
    INNER JOIN client_contracts cc ON cs.contract_id = cc.id
    WHERE cc.client_id = c.id AND cc.status = 'active' AND cs.status = 'active'
      AND (cs.effective_to IS NULL OR cs.effective_to >= CURRENT_DATE)
  ), 0) as real_mrr,
  -- Outstanding (unpaid + overdue)
  COALESCE((
    SELECT SUM(cb.grand_total)
    FROM contract_billings cb
    INNER JOIN client_contracts cc ON cb.contract_id = cc.id
    WHERE cc.client_id = c.id AND cb.status IN ('unpaid', 'overdue')
  ), 0) as outstanding,
  -- Paid this month
  COALESCE((
    SELECT SUM(cb.grand_total)
    FROM contract_billings cb
    INNER JOIN client_contracts cc ON cb.contract_id = cc.id
    WHERE cc.client_id = c.id AND cb.status = 'paid'
      AND cb.paid_at IS NOT NULL
      AND TO_CHAR(cb.paid_at, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  ), 0) as paid_this_month,
  -- Overdue count
  COALESCE((
    SELECT COUNT(*)
    FROM contract_billings cb
    INNER JOIN client_contracts cc ON cb.contract_id = cc.id
    WHERE cc.client_id = c.id AND cb.status = 'overdue'
  ), 0) as overdue_count
FROM clients c;

-- ============================================
-- Trigger: Auto-update clients.contract_value when services change
-- ============================================
CREATE OR REPLACE FUNCTION sync_client_contract_value()
RETURNS TRIGGER AS $$
DECLARE
  v_client_id UUID;
  v_total NUMERIC;
BEGIN
  -- Get client_id from the contract
  SELECT client_id INTO v_client_id FROM client_contracts WHERE id = NEW.contract_id;
  
  IF v_client_id IS NOT NULL THEN
    -- Calculate total MRR for this client
    SELECT COALESCE(SUM(cs.monthly_fee), 0) INTO v_total
    FROM contract_services cs
    INNER JOIN client_contracts cc ON cs.contract_id = cc.id
    WHERE cc.client_id = v_client_id AND cc.status = 'active' AND cs.status = 'active'
      AND (cs.effective_to IS NULL OR cs.effective_to >= CURRENT_DATE);
    
    -- Update clients table
    UPDATE clients SET contract_value = v_total WHERE id = v_client_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS trg_sync_contract_value ON contract_services;

-- Create trigger
CREATE TRIGGER trg_sync_contract_value
  AFTER INSERT OR UPDATE OR DELETE ON contract_services
  FOR EACH ROW EXECUTE FUNCTION sync_client_contract_value();

-- ============================================
-- Comments
-- ============================================
COMMENT ON FUNCTION get_client_mrr IS 'Returns real MRR from active contract_services';
COMMENT ON FUNCTION get_client_outstanding IS 'Returns total unpaid/overdue billing for a client';
COMMENT ON VIEW client_financial_summary IS 'Aggregated financial data per client (MRR, outstanding, paid)';