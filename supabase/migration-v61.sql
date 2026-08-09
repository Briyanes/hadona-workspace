-- ═══════════════════════════════════════════════════════════
-- Migration v61: Contract Renewal Tracking & Notifications
-- Adds renewal tracking fields and reminder notifications for AE
-- ═══════════════════════════════════════════════════════════

-- 1. Add renewal tracking fields to client_contracts
ALTER TABLE client_contracts 
  ADD COLUMN IF NOT EXISTS renewal_status TEXT DEFAULT 'active'
    CHECK (renewal_status IN ('active', 'renewing', 'expiring', 'expired', 'cancelled')),
  ADD COLUMN IF NOT EXISTS renewal_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewal_notes TEXT;

-- 2. Add index for fast renewal queries
CREATE INDEX IF NOT EXISTS idx_contracts_renewal_lookup 
  ON client_contracts(end_date, status, renewal_status)
  WHERE status = 'active';

-- 3. Add columns to invoices for better tracking (if not exists)
ALTER TABLE invoices 
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- 4. Create contract renewal log table
CREATE TABLE IF NOT EXISTS contract_renewal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES client_contracts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('reminder_sent', 'renewed', 'expired', 'cancelled')),
  days_before_expiry INTEGER,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE contract_renewal_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can view renewal logs" ON contract_renewal_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Team can create renewal logs" ON contract_renewal_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );

-- 6. Add notification types for contract renewal
INSERT INTO notification_types (name, label, description, category) VALUES
  ('contract_renewal_30d', 'Contract Renewal - 30 Days', 'Reminder 30 days before contract expires', 'contracts'),
  ('contract_renewal_14d', 'Contract Renewal - 14 Days', 'Reminder 14 days before contract expires', 'contracts'),
  ('contract_renewal_7d', 'Contract Renewal - 7 Days', 'Reminder 7 days before contract expires', 'contracts'),
  ('contract_renewal_expired', 'Contract Expired', 'Notification when contract has expired', 'contracts'),
  ('invoice_overdue_3d', 'Invoice Overdue - 3 Days', 'Reminder 3 days after invoice due date', 'invoices'),
  ('invoice_overdue_7d', 'Invoice Overdue - 7 Days', 'Reminder 7 days after invoice due date', 'invoices')
ON CONFLICT (name) DO NOTHING;