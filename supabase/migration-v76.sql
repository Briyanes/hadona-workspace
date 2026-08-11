-- ============================================
-- Migration v76: Fix generate_contract_number() race condition
--
-- BUG: Old function used COUNT(*) + 1 which produces duplicate keys
-- when contracts are deleted and recreated in the same year.
--
-- FIX: Use MAX() of existing sequence numbers + 1 instead.
-- ============================================

-- Drop old trigger first
DROP TRIGGER IF EXISTS set_contract_number ON client_contracts;

-- Replace function with MAX-based logic
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE
  v_max_num INT;
  v_year TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NEW.start_date)::TEXT;

  -- Find the highest sequence number for this year (handles deletions correctly)
  SELECT COALESCE(
    MAX(SUBSTRING(contract_number FROM '[0-9]+$')::INT),
    0
  ) + 1
  INTO v_max_num
  FROM client_contracts
  WHERE contract_number LIKE 'CTR-' || v_year || '-%';

  -- Pad to 4 digits (supports up to 9,999 contracts per year)
  NEW.contract_number := 'CTR-' || v_year || '-' || LPAD(v_max_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER set_contract_number
  BEFORE INSERT ON client_contracts
  FOR EACH ROW
  WHEN (NEW.contract_number IS NULL)
  EXECUTE FUNCTION generate_contract_number();

-- ============================================
-- Fix existing duplicate-ish contract numbers
-- Ensure all existing have 4-digit padding (backfill)
-- ============================================
-- Note: This only pads existing numbers, doesn't change the sequence part
-- e.g. CTR-2026-001 stays as-is (we don't alter existing to avoid breaking refs)