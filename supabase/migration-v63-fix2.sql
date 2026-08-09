-- =============================================
-- Migration v63-fix2: Rename output params to avoid ALL ambiguity with table columns
-- =============================================

DROP FUNCTION IF EXISTS regenerate_unpaid_billings(UUID);

CREATE OR REPLACE FUNCTION regenerate_unpaid_billings(
  p_contract_id UUID
)
-- Use prefixed names to avoid conflict with table column names
RETURNS TABLE(
  out_billing_period TEXT,
  out_billing_status TEXT,
  out_due_date DATE,
  out_grand_total NUMERIC
) AS $$
DECLARE
  b RECORD;
  v_total NUMERIC;
  v_subtotal NUMERIC;
  v_discount NUMERIC;
  v_tax_rate NUMERIC;
  v_tax NUMERIC;
  v_grand NUMERIC;
  v_payment_due_day INT;
  v_discount_percent NUMERIC;
  v_period_year INT;
  v_period_month INT;
  v_last_day INT;
  v_new_due_date DATE;
  v_services_json JSONB;
  v_period_date DATE;
  v_bill_status TEXT;
BEGIN
  -- Get contract settings
  SELECT
    cc.tax_rate,
    cc.payment_due_day,
    cc.discount_percent
  INTO
    v_tax_rate,
    v_payment_due_day,
    v_discount_percent
  FROM client_contracts cc
  WHERE cc.id = p_contract_id;

  -- Loop through all unpaid/overdue billings
  FOR b IN
    SELECT cb.id, cb.billing_period, cb.status AS bill_status
    FROM contract_billings cb
    WHERE cb.contract_id = p_contract_id
      AND cb.status IN ('unpaid', 'overdue')
  LOOP
    v_period_date := (b.billing_period || '-01')::DATE;
    v_bill_status := b.bill_status;

    -- Recalculate from active services
    v_total := get_contract_monthly_total(p_contract_id, v_period_date);
    v_discount := v_total * COALESCE(v_discount_percent, 0) / 100.0;
    v_subtotal := v_total - v_discount;
    v_tax := v_subtotal * COALESCE(v_tax_rate, 0) / 100.0;
    v_grand := v_subtotal + v_tax;

    -- Recalculate due_date
    v_period_year := SPLIT_PART(b.billing_period, '-', 1)::INT;
    v_period_month := SPLIT_PART(b.billing_period, '-', 2)::INT;
    v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(v_period_year, v_period_month, 1)) + INTERVAL '1 month - 1 day'))::INT;

    IF COALESCE(v_payment_due_day, 14) > v_last_day THEN
      v_new_due_date := make_date(v_period_year, v_period_month, v_last_day);
    ELSE
      v_new_due_date := make_date(v_period_year, v_period_month, COALESCE(v_payment_due_day, 14));
    END IF;

    -- Re-snapshot services (use cs. alias to avoid any ambiguity)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'service', cs.service_name,
      'fee', cs.monthly_fee,
      'effective_from', cs.effective_from
    )), '[]'::jsonb) INTO v_services_json
    FROM contract_services cs
    WHERE cs.contract_id = p_contract_id
      AND cs.effective_from <= v_period_date
      AND (cs.effective_to IS NULL OR cs.effective_to >= date_trunc('month', v_period_date)::date)
      AND cs.status = 'active';

    -- Update billing record
    UPDATE contract_billings SET
      total_amount = v_subtotal,
      tax_amount = v_tax,
      grand_total = v_grand,
      due_date = v_new_due_date,
      applied_tax_rate = COALESCE(v_tax_rate, 0),
      applied_discount_percent = COALESCE(v_discount_percent, 0),
      discount_amount = v_discount,
      services_snapshot = v_services_json,
      updated_at = now()
    WHERE id = b.id;

    out_billing_period := b.billing_period;
    out_billing_status := v_bill_status;
    out_due_date := v_new_due_date;
    out_grand_total := v_grand;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

SELECT 'Migration v63-fix2 complete — all ambiguous columns resolved' as status;