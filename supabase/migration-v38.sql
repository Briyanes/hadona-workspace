-- ============================================
-- Migration v38: Contract & Billing System
-- Supports: minimum 3-month contracts, per-month pricing,
-- service upsell mid-contract, monthly billing tracking
-- ============================================

-- ============================================
-- 1. client_contracts — Header Kontrak
-- ============================================
CREATE TABLE IF NOT EXISTS client_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_number TEXT UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  minimum_months INT NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'expired', 'terminated', 'renewed')),
  contract_type TEXT DEFAULT 'monthly'
    CHECK (contract_type IN ('monthly', 'quarterly', 'semi-annual', 'annual')),
  notes TEXT,
  signed_url TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-generate contract number
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE
  counter INT;
  year_text TEXT;
BEGIN
  year_text := EXTRACT(YEAR FROM NEW.start_date)::TEXT;
  SELECT COUNT(*) + 1 INTO counter
  FROM client_contracts
  WHERE EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM NEW.start_date);

  NEW.contract_number := 'CTR-' || year_text || '-' || LPAD(counter::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_contract_number
  BEFORE INSERT ON client_contracts
  FOR EACH ROW
  WHEN (NEW.contract_number IS NULL)
  EXECUTE FUNCTION generate_contract_number();

-- ============================================
-- 2. contract_services — Line Items (Service + Price)
-- Supports price changes over time within same contract
-- ============================================
CREATE TABLE IF NOT EXISTS contract_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  monthly_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE, -- NULL = still active, non-null = service ended
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended')),
  added_by UUID REFERENCES profiles(id),
  notes TEXT, -- e.g. "Added because Meta Ads performance was winning"
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contract_services_contract ON contract_services(contract_id);
CREATE INDEX idx_contract_services_active ON contract_services(contract_id) WHERE effective_to IS NULL;

-- ============================================
-- 3. contract_billings — Monthly Billing Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS contract_billings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES client_contracts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  billing_period TEXT NOT NULL, -- Format: '2026-01' (YYYY-MM)
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) DEFAULT 0, -- PPN 11%
  grand_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'paid', 'overdue', 'cancelled')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  payment_method TEXT, -- 'transfer', 'cash', 'midtrans'
  payment_ref TEXT, -- bukti transfer / transaction ID
  invoice_url TEXT,
  services_snapshot JSONB, -- snapshot of active services at billing time
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_billings_contract_period ON contract_billings(contract_id, billing_period);
CREATE INDEX idx_billings_client ON contract_billings(client_id);
CREATE INDEX idx_billings_status ON contract_billings(status);
CREATE INDEX idx_billings_period ON contract_billings(billing_period);

-- ============================================
-- 4. RLS Policies
-- ============================================
ALTER TABLE client_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_billings ENABLE ROW LEVEL SECURITY;

-- client_contracts: all authenticated can view, PM/admin can manage
CREATE POLICY "contracts_select_auth" ON client_contracts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "contracts_insert_auth" ON client_contracts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "contracts_update_auth" ON client_contracts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "contracts_delete_auth" ON client_contracts
  FOR DELETE TO authenticated USING (true);

-- contract_services
CREATE POLICY "cservices_select_auth" ON contract_services
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cservices_insert_auth" ON contract_services
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "cservices_update_auth" ON contract_services
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "cservices_delete_auth" ON contract_services
  FOR DELETE TO authenticated USING (true);

-- contract_billings
CREATE POLICY "billings_select_auth" ON contract_billings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "billings_insert_auth" ON contract_billings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "billings_update_auth" ON contract_billings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "billings_delete_auth" ON contract_billings
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 5. Helper: Calculate monthly total for a contract
-- Returns sum of all active services for given period
-- ============================================
CREATE OR REPLACE FUNCTION get_contract_monthly_total(
  p_contract_id UUID,
  p_period_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC AS $$
DECLARE
  total NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(monthly_fee), 0) INTO total
  FROM contract_services
  WHERE contract_id = p_contract_id
    AND effective_from <= p_period_date
    AND (effective_to IS NULL OR effective_to >= date_trunc('month', p_period_date)::date)
    AND status = 'active';
  RETURN total;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 6. Helper: Generate or update monthly billing
-- Called manually or via cron on the 1st of each month
-- ============================================
CREATE OR REPLACE FUNCTION generate_monthly_billing(
  p_contract_id UUID,
  p_period TEXT -- '2026-01'
)
RETURNS UUID AS $$
DECLARE
  v_client_id UUID;
  v_total NUMERIC;
  v_tax NUMERIC;
  v_grand NUMERIC;
  v_billing_id UUID;
  v_period_date DATE;
  v_services_json JSONB;
  v_due_date DATE;
BEGIN
  -- Get contract info
  SELECT client_id, (p_period || '-01')::DATE INTO v_client_id, v_period_date
  FROM client_contracts WHERE id = p_contract_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found: %', p_contract_id;
  END IF;

  -- Calculate total
  v_total := get_contract_monthly_total(p_contract_id, v_period_date);
  v_tax := v_total * 0.11; -- PPN 11%
  v_grand := v_total + v_tax;

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

  -- Due date: 14 days into the billing period
  v_due_date := (p_period || '-14')::DATE;

  -- Upsert billing record
  INSERT INTO contract_billings (
    contract_id, client_id, billing_period,
    total_amount, tax_amount, grand_total,
    status, due_date, services_snapshot
  )
  VALUES (
    p_contract_id, v_client_id, p_period,
    v_total, v_tax, v_grand,
    'unpaid', v_due_date, v_services_json
  )
  ON CONFLICT (contract_id, billing_period)
  DO UPDATE SET
    total_amount = EXCLUDED.total_amount,
    tax_amount = EXCLUDED.tax_amount,
    grand_total = EXCLUDED.grand_total,
    services_snapshot = EXCLUDED.services_snapshot,
    updated_at = now()
  RETURNING id INTO v_billing_id;

  RETURN v_billing_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Updated_at triggers
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contracts_updated_at
  BEFORE UPDATE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER billings_updated_at
  BEFORE UPDATE ON contract_billings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();