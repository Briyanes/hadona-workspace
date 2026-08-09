-- Migration v59: Add contract_billing_id to invoices table
-- This links invoices to their contract_billings records for line items lookup

-- Add contract_billing_id column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoices' AND column_name = 'contract_billing_id'
    ) THEN
        ALTER TABLE invoices ADD COLUMN contract_billing_id UUID REFERENCES contract_billings(id) ON DELETE SET NULL;
        CREATE INDEX idx_invoices_contract_billing_id ON invoices(contract_billing_id) WHERE contract_billing_id IS NOT NULL;
    END IF;
END $$;

-- Update auto-billing function to set contract_billing_id when creating invoices
CREATE OR REPLACE FUNCTION generate_monthly_billings()
RETURNS void AS $$
DECLARE
    c RECORD;
    billing_id UUID;
    inv_num TEXT;
    ppn_rate NUMERIC := 0.11;
    has_ppn BOOLEAN;
    monthly_fee NUMERIC;
    tax_amount NUMERIC;
    total_amount NUMERIC;
    svc_count INT;
    due_date DATE;
    period_start DATE;
    period_end DATE;
    services_json JSONB;
BEGIN
    -- Get active contracts
    FOR c IN
        SELECT id, client_id, start_date, end_date, value, tax_type,
               prepaid_type, prepaid_amount, billing_day
        FROM contracts
        WHERE status = 'active'
        AND prepaid_type != 'full'
    LOOP
        -- Check if billing already exists for current month
        IF EXISTS (
            SELECT 1 FROM contract_billings
            WHERE contract_id = c.id
            AND billing_month = EXTRACT(MONTH FROM CURRENT_DATE)
            AND billing_year = EXTRACT(YEAR FROM CURRENT_DATE)
        ) THEN
            CONTINUE;
        END IF;

        -- Skip if contract not started yet or ended
        IF CURRENT_DATE < c.start_date OR CURRENT_DATE > c.end_date THEN
            CONTINUE;
        END IF;

        -- Calculate monthly fee from contract_services
        SELECT COALESCE(SUM(fee), 0), COUNT(*)
        INTO monthly_fee, svc_count
        FROM contract_services
        WHERE contract_id = c.id;

        -- Fallback to contract value if no services
        IF monthly_fee = 0 OR svc_count = 0 THEN
            monthly_fee := c.value;
        END IF;

        has_ppn := (c.tax_type = 'ppn');
        tax_amount := CASE WHEN has_ppn THEN monthly_fee * ppn_rate ELSE 0 END;
        total_amount := monthly_fee + tax_amount;

        -- Billing dates
        period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
        period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        due_date := LEAST(
            MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT, EXTRACT(MONTH FROM CURRENT_DATE)::INT, COALESCE(c.billing_day, 10)),
            period_end
        );

        -- Snapshot services
        SELECT COALESCE(jsonb_agg(jsonb_build_object('service', service, 'fee', fee)), '[]'::jsonb)
        INTO services_json
        FROM contract_services
        WHERE contract_id = c.id;

        -- Create billing record
        INSERT INTO contract_billings (
            contract_id, client_id, billing_month, billing_year,
            period_start, period_end, due_date,
            amount, tax_amount, total_amount,
            services_snapshot, status
        ) VALUES (
            c.id, c.client_id,
            EXTRACT(MONTH FROM CURRENT_DATE)::INT,
            EXTRACT(YEAR FROM CURRENT_DATE)::INT,
            period_start, period_end, due_date,
            monthly_fee, tax_amount, total_amount,
            services_json, 'issued'
        ) RETURNING id INTO billing_id;

        -- Generate invoice number
        inv_num := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || UPPER(SUBSTRING(c.id::text, 1, 4));

        -- Create invoice linked to billing
        INSERT INTO invoices (
            client_id, contract_id, contract_billing_id,
            invoice_number, issue_date, due_date,
            amount, tax, status, billing_period
        ) VALUES (
            c.client_id, c.id, billing_id,
            inv_num, CURRENT_DATE, due_date,
            monthly_fee, tax_amount, 'unpaid',
            TO_CHAR(period_start, 'DD Mon') || ' - ' || TO_CHAR(period_end, 'DD Mon YYYY')
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql;