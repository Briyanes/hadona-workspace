-- ============================================
-- Migration v55: Fix generate_monthly_billing
-- BACA tax_rate, payment_due_day, discount_percent dari kontrak
-- Sebelumnya hard-code PPN 11% dan tanggal 14
-- ============================================

CREATE OR REPLACE FUNCTION generate_monthly_billing(
  p_contract_id UUID,
  p_period TEXT -- '2026-01'
)
RETURNS UUID AS $$
DECLARE
  v_client_id UUID;
  v_total NUMERIC;
  v_subtotal NUMERIC; -- setelah diskon
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
BEGIN
  -- Get contract info (termasuk tax_rate, payment_due_day, discount_percent)
  SELECT
    client_id,
    tax_rate,
    payment_due_day,
    discount_percent,
    (p_period || '-01')::DATE
  INTO
    v_client_id,
    v_tax_rate,
    v_payment_due_day,
    v_discount_percent,
    v_period_date
  FROM client_contracts WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found: %', p_contract_id;
  END IF;

  -- Calculate subtotal dari active services
  v_total := get_contract_monthly_total(p_contract_id, v_period_date);

  -- Apply discount jika ada
  v_discount := v_total * COALESCE(v_discount_percent, 0) / 100.0;
  v_subtotal := v_total - v_discount;

  -- Calculate tax menggunakan tax_rate dari kontrak (bukan hard-code 11%)
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

  -- Due date: gunakan payment_due_day dari kontrak (bukan hard-code 14)
  -- Handle edge case: jika payment_due_day > jumlah hari di bulan tersebut
  v_period_year := SPLIT_PART(p_period, '-', 1)::INT;
  v_period_month := SPLIT_PART(p_period, '-', 2)::INT;
  v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(v_period_year, v_period_month, 1)) + INTERVAL '1 month - 1 day'))::INT;

  IF COALESCE(v_payment_due_day, 14) > v_last_day THEN
    v_due_date := make_date(v_period_year, v_period_month, v_last_day);
  ELSE
    v_due_date := make_date(v_period_year, v_period_month, COALESCE(v_payment_due_day, 14));
  END IF;

  -- Upsert billing record
  INSERT INTO contract_billings (
    contract_id, client_id, billing_period,
    total_amount, tax_amount, grand_total,
    status, due_date, services_snapshot
  )
  VALUES (
    p_contract_id, v_client_id, p_period,
    v_subtotal, v_tax, v_grand,
    'unpaid', v_due_date, v_services_json
  )
  ON CONFLICT (contract_id, billing_period)
  DO UPDATE SET
    total_amount = EXCLUDED.total_amount,
    tax_amount = EXCLUDED.tax_amount,
    grand_total = EXCLUDED.grand_total,
    due_date = EXCLUDED.due_date,
    services_snapshot = EXCLUDED.services_snapshot,
    updated_at = now()
  RETURNING id INTO v_billing_id;

  RETURN v_billing_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Tambah kolom discount_amount & tax_rate_snapshot di contract_billings
-- Untuk audit trail (menyimpan rate yang dipakai saat generate)
-- ============================================
ALTER TABLE contract_billings
  ADD COLUMN IF NOT EXISTS applied_tax_rate NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_discount_percent NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN contract_billings.applied_tax_rate IS 'Tax rate yang dipakai saat generate (snapshot dari kontrak)';
COMMENT ON COLUMN contract_billings.applied_discount_percent IS 'Diskon % yang dipakai saat generate';
COMMENT ON COLUMN contract_billings.discount_amount IS 'Nilai diskon (Rupiah)';

-- ============================================
-- Update function untuk menyimpan snapshot rate
-- ============================================
CREATE OR REPLACE FUNCTION generate_monthly_billing_v2(
  p_contract_id UUID,
  p_period TEXT
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
BEGIN
  SELECT
    client_id,
    tax_rate,
    payment_due_day,
    discount_percent,
    (p_period || '-01')::DATE
  INTO
    v_client_id,
    v_tax_rate,
    v_payment_due_day,
    v_discount_percent,
    v_period_date
  FROM client_contracts WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found: %', p_contract_id;
  END IF;

  v_total := get_contract_monthly_total(p_contract_id, v_period_date);
  v_discount := v_total * COALESCE(v_discount_percent, 0) / 100.0;
  v_subtotal := v_total - v_discount;
  v_tax := v_subtotal * COALESCE(v_tax_rate, 0) / 100.0;
  v_grand := v_subtotal + v_tax;

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

  v_period_year := SPLIT_PART(p_period, '-', 1)::INT;
  v_period_month := SPLIT_PART(p_period, '-', 2)::INT;
  v_last_day := EXTRACT(DAY FROM (DATE_TRUNC('month', make_date(v_period_year, v_period_month, 1)) + INTERVAL '1 month - 1 day'))::INT;

  IF COALESCE(v_payment_due_day, 14) > v_last_day THEN
    v_due_date := make_date(v_period_year, v_period_month, v_last_day);
  ELSE
    v_due_date := make_date(v_period_year, v_period_month, COALESCE(v_payment_due_day, 14));
  END IF;

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

SELECT 'Migration v55 complete — generate_monthly_billing now reads tax_rate, payment_due_day, discount_percent from contract' as status;