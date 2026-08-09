-- Migration v57: Prepaid Contract Support + Invoice PDF fields
-- Adds: payment_schedule, is_prepaid, total_months_prepaid on client_contracts
-- Adds: pdf_url, notes, billing_period on invoices

-- =============================================
-- 1. Add prepaid fields to client_contracts
-- =============================================
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS payment_schedule TEXT DEFAULT 'monthly';
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS is_prepaid BOOLEAN DEFAULT FALSE;
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS total_months_prepaid INTEGER DEFAULT 1;
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS prepaid_amount NUMERIC(15,2) DEFAULT 0;

-- =============================================
-- 2. Add PDF + notes fields to invoices
-- =============================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bank_info TEXT;

-- =============================================
-- 3. Comments
-- =============================================
COMMENT ON COLUMN client_contracts.payment_schedule IS 'monthly | quarterly | annual | prepaid_full';
COMMENT ON COLUMN client_contracts.is_prepaid IS 'If true, client paid full amount upfront for N months';
COMMENT ON COLUMN client_contracts.total_months_prepaid IS 'Number of months covered by prepaid payment';
COMMENT ON COLUMN client_contracts.prepaid_amount IS 'Total amount paid upfront';

-- =============================================
-- 4. Create sequence for invoice numbers if not exists
-- =============================================
CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;