-- =============================================
-- Migration v58: Consolidate billing function + Prepaid support
-- 1. Replace generate_monthly_billing (add snapshot fields + prepaid skip)
-- 2. Drop generate_monthly_billing_v2 (redundant)
-- 3. Fix: Auto-billing skips contracts still within prepaid period
-- =============================================

-- Drop old redundant function first
DROP FUNCTION IF EXISTS generate_monthly_billing_v2(UUID, TEXT);

-- =============================================
-- Replace generate_monthly_billing with consolidated version
-- Now saves: applied_tax_rate, applied_discount_percent, discount_amount
-- Handles edge case: payment_due_day > last day of month
-- =============================================
CREATE OR REPLACE FUNCTION generate_monthly_billing(
  p_contract_id UUID,
  p_period TEXT -- 'YYYY-MM'
)
RETURNS UUID AS $$
DECLARE
  v_client_id UUID;
  v_total NUMERIC;
  v_subtotal NUMERIC;
  v_discount NUMERIC;
  v_tax_rate NUMERIC;
  v_tax NUMERIC;
  v_grand NUMERIC;
  v_billing_id UUID;
  v_period_date DATE;
  v_services_json JSONB;
  v_due_date DATE;
  v_payment_due_day INT;
  v_discount_percent NUMERIC;
  v_period_month INT;
  v_period_year INT;
  v_last_day INT;
  -- Prepaid fields
  v_is_prepaid BOOLEAN;
  v_total_months_prepaid INT;
  v_contract_start_date DATE;
  v_prepaid_end_date DATE;
BEGIN
  -- Get contract info including prepaid fields
  SELECT
    cc.client_id,
    cc.tax_rate,
    cc.payment_due_day,
    cc.discount_percent,
    cc.is_prepaid,
    cc.total_months_prepaid,
    cc.start_date,
    (p_period || '-01')::DATE
  INTO
    v_client_id,
    v_tax_rate,
    v_payment_due_day,
    v_discount_percent,
    v_is_prepaid,
    v_total_months_prepaid,
    v_contract_start_date,
    v_period_date
  FROM client_contracts cc
  WHERE cc.id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found: %', p_contract_id;
  END IF;

  -- ═══ PREPAID CHECK ═══
  -- If contract is prepaid and current period is still within prepaid months, skip
  IF COALESCE(v_is_prepaid, false) AND COALESCE(v_total_months_prepaid, 0) > 0 THEN
    v_prepaid_end_date := (DATE_TRUNC('month', COALESCE(v_contract_start_date, v_period_date)) 
                           + make_interval(months => v_total_months_prepaid))::DATE;
    
    IF v_period_date < v_prepaid_end_date THEN
      -- Still within prepaid period - return NULL (skip)
      RAISE NOTICE 'Contract % is prepaid for % months - skipping period %', 
        p_contract_id, v_total_months_prepaid, p_period;
      RETURN NULL;
    END IF;
  END IF;

  -- Calculate subtotal from active services
  v_total := get_contract_monthly_total(p_contract_id, v_period_date);

  -- Apply discount if any
  v_discount := v_total * COALESCE(v_discount_percent, 0) / 100.0;
  v_subtotal := v_total - v_discount;

  -- Calculate tax using tax_rate from contract (not hard-coded)
  v_tax := v_subtotal * COALESCE(v_tax_rate, 0) / 100.0;
  v_grand := v_subtotal + v_tax;

  -- Snapshot active services
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'service', service_name,
    'fee', monthly_fee,
    'effective_from', effective_from
  )), '[]'::jsonb) INTO v_services_json
  FROM contract_services
  WHERE contract_id = p_contract_id
    AND effective_from <= v_period_date
    AND (effective_to IS NULL OR effective_to >= date_trunc('month', v_period_date)::date)
    AND status = 'active';

  -- Due date: use payment_due_day from contract
  -- Handle edge case: payment_due_day > last day of month
  v_period_year := SPLIT_PART(p_period, '-', 1)::INT;
  v_period_month := SPLIT_PART(p_period, '-', 2)::INT;
  v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(v_period_year, v_period_month, 1)) + INTERVAL '1 month - 1 day'))::INT;

  IF COALESCE(v_payment_due_day, 14) > v_last_day THEN
    v_due_date := make_date(v_period_year, v_period_month, v_last_day);
  ELSE
    v_due_date := make_date(v_period_year, v_period_month, COALESCE(v_payment_due_day, 14));
  END IF;

  -- Upsert billing record with snapshot fields
  INSERT INTO contract_billings (
    contract_id, client_id, billing_period,
    total_amount, tax_amount, grand_total,
    status, due_date, services_snapshot,
    applied_tax_rate, applied_discount_percent, discount_amount
  )
  VALUES (
    p_contract_id, v_client_id, p_period,
    v_subtotal, v_tax, v_grand,
    'unpaid', v_due_date, v_services_json,
    COALESCE(v_tax_rate, 0), COALESCE(v_discount_percent, 0), v_discount
  )
  ON CONFLICT (contract_id, billing_period)
  DO UPDATE SET
    total_amount = EXCLUDED.total_amount,
    tax_amount = EXCLUDED.tax_amount,
    grand_total = EXCLUDED.grand_total,
    due_date = EXCLUDED.due_date,
    services_snapshot = EXCLUDED.services_snapshot,
    applied_tax_rate = EXCLUDED.applied_tax_rate,
    applied_discount_percent = EXCLUDED.applied_discount_percent,
    discount_amount = EXCLUDED.discount_amount,
    updated_at = now()
  RETURNING id INTO v_billing_id;

  RETURN v_billing_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Add is_prepaid column to contract_billings view (for reporting)
-- =============================================
CREATE OR REPLACE VIEW contract_billing_summary AS
SELECT 
  cb.id,
  cb.contract_id,
  cb.client_id,
  cb.billing_period,
  cb.total_amount,
  cb.tax_amount,
  cb.grand_total,
  cb.status,
  cb.due_date,
  cb.applied_tax_rate,
  cb.applied_discount_percent,
  cb.discount_amount,
  cb.services_snapshot,
  c.name as client_name,
  cc.contract_number,
  cc.is_prepaid,
  cc.total_months_prepaid,
  cc.prepaid_amount
FROM contract_billings cb
JOIN clients c ON c.id = cb.client_id
LEFT JOIN client_contracts cc ON cc.id = cb.contract_id;

SELECT 'Migration v58 complete — billing function consolidated with prepaid support + snapshot fields' as status;