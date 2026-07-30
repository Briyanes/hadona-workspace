-- ============================================
-- Migration V6: Client Contract & Account Manager
-- Adds contract tracking and AM assignment fields
-- ============================================

-- Add contract fields to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS contract_value NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_start DATE,
  ADD COLUMN IF NOT EXISTS contract_end DATE,
  ADD COLUMN IF NOT EXISTS account_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Update the client_status enum if it doesn't have 'churned'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'client_status' AND e.enumlabel = 'churned'
  ) THEN
    ALTER TYPE client_status ADD VALUE 'churned';
  END IF;
END
$$;

-- Comment
COMMENT ON COLUMN public.clients.contract_value IS 'Nilai kontrak per bulan (IDR)';
COMMENT ON COLUMN public.clients.contract_start IS 'Tanggal mulai kontrak';
COMMENT ON COLUMN public.clients.contract_end IS 'Tanggal berakhir kontrak';
COMMENT ON COLUMN public.clients.account_manager_id IS 'Account Manager yang menangani client ini';

-- ============================================
-- Enable RLS for new columns (inherit from table)
-- ============================================
-- RLS already on clients table, policies apply automatically