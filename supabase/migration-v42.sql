-- ============================================
-- Migration v42: Agency-grade fields for client_contracts
-- Adds: PIC client, sales/AM, payment terms, bank, discount, tax override
-- ============================================

-- Add new columns to client_contracts
ALTER TABLE client_contracts
  ADD COLUMN IF NOT EXISTS pic_name text,
  ADD COLUMN IF NOT EXISTS pic_phone text,
  ADD COLUMN IF NOT EXISTS pic_email text,
  ADD COLUMN IF NOT EXISTS sales_person_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS payment_due_day int DEFAULT 14 CHECK (payment_due_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS bank_account text DEFAULT 'BCA',
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) DEFAULT 11.00,
  ADD COLUMN IF NOT EXISTS contract_value_estimate numeric(14,2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN client_contracts.pic_name IS 'PIC (contact person) di sisi client';
COMMENT ON COLUMN client_contracts.pic_phone IS 'No HP/WA PIC client';
COMMENT ON COLUMN client_contracts.pic_email IS 'Email PIC client';
COMMENT ON COLUMN client_contracts.sales_person_id IS 'Account Manager / Sales internal yang handle';
COMMENT ON COLUMN client_contracts.payment_due_day IS 'Tanggal jatuh tempo setiap bulan (default: 14)';
COMMENT ON COLUMN client_contracts.bank_account IS 'Bank tujuan transfer (BCA, Mandiri, BNI, dll)';
COMMENT ON COLUMN client_contracts.discount_percent IS 'Diskon khusus (%), default 0';
COMMENT ON COLUMN client_contracts.tax_rate IS 'Tax rate override (default PPN 11%), bisa 0 untuk non-PKP';
COMMENT ON COLUMN client_contracts.contract_value_estimate IS 'Estimasi nilai kontrak (auto-calc atau manual)';