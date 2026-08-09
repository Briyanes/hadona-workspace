-- =============================================
-- Migration v63: Fix billing due_date & tax_rate bug + Auto-regenerate on contract edit
--
-- PROBLEM:
--   - Billing yang di-generate punya due_date & tax_rate yang tidak sesuai kontrak
--   - Setelah kontrak di-edit (ubah payment_due_day / tax_rate), billing existing tidak update
--   - Function lama generate_monthly_billings() (plural, v59) bermasalah
--
-- FIX:
--   1. Drop function lama generate_monthly_billings() (plural)
--   2. Re-ensure generate_monthly_billing() uses contract's payment_due_day & tax_rate
--   3. Add function regenerate_unpaid_billings() untuk auto-fix billing setelah kontrak di-edit
-- =============================================

-- ═══════════════════════════════════════════════════
-- 1. DROP OLD BROKEN FUNCTION (v59 - plural version)
-- ═══════════════════════════════════════════════════
DROP FUNCTION IF EXISTS generate_monthly_billings();


-- ═══════════════════════════════════════════════════
-- 2. RE-CREATE generate_monthly_billing (canonical, correct version)
--    Reads payment_due_day & tax_rate from contract
-- ═══════════════════════════════════════════════════
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
  IF COALESCE(v_is_prepaid, false) AND COALESCE(v_total_months_prepaid, 0) > 0 THEN
    v_prepaid_end_date := (DATE_TRUNC('month', COALESCE(v_contract_start_date, v_period_date))
                           + make_interval(months => v_total_months_prepaid))::DATE;

    IF v_period_date < v_prepaid_end_date THEN
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

  -- Calculate tax using tax_rate from contract (not hard-coded!)
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


-- ═══════════════════════════════════════════════════
-- 3. NEW: regenerate_unpaid_billings()
--    Re-generate semua billing yang masih unpaid/overdue untuk contract tertentu
--    Dipanggil setelah kontrak di-edit agar due_date & tax_rate ikut update
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION regenerate_unpaid_billings(
  p_contract_id UUID
)
RETURNS TABLE(billing_period TEXT, status TEXT, due_date DATE, grand_total NUMERIC) AS $$
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

  -- Loop through all unpaid/overdue billings for this contract
  FOR b IN
    SELECT * FROM contract_billings
    WHERE contract_id = p_contract_id
      AND status IN ('unpaid', 'overdue')
  LOOP
    v_period_date := (b.billing_period || '-01')::DATE;

    -- Recalculate from active services
    v_total := get_contract_monthly_total(p_contract_id, v_period_date);
    v_discount := v_total * COALESCE(v_discount_percent, 0) / 100.0;
    v_subtotal := v_total - v_discount;
    v_tax := v_subtotal * COALESCE(v_tax_rate, 0) / 100.0;
    v_grand := v_subtotal + v_tax;

    -- Recalculate due_date from payment_due_day
    v_period_year := SPLIT_PART(b.billing_period, '-', 1)::INT;
    v_period_month := SPLIT_PART(b.billing_period, '-', 2)::INT;
    v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(v_period_year, v_period_month, 1)) + INTERVAL '1 month - 1 day'))::INT;

    IF COALESCE(v_payment_due_day, 14) > v_last_day THEN
      v_new_due_date := make_date(v_period_year, v_period_month, v_last_day);
    ELSE
      v_new_due_date := make_date(v_period_year, v_period_month, COALESCE(v_payment_due_day, 14));
    END IF;

    -- Re-snapshot services
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

    billing_period := b.billing_period;
    status := b.status;
    due_date := v_new_due_date;
    grand_total := v_grand;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;


SELECT 'Migration v63 complete — billing function fixed + regenerate_unpaid_billings() added' as status;