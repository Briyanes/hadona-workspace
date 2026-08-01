-- ═══════════════════════════════════════════════════════════
-- Migration v25: Approval Workflow + Budget Pacing Alerts
-- ═══════════════════════════════════════════════════════════

-- ── 1. TASK APPROVAL WORKFLOW ──
-- Add approval fields to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
  CHECK (approval_status IN ('pending', 'approved', 'rejected', 'changes_requested'));

-- Index for filtering pending approvals
CREATE INDEX IF NOT EXISTS idx_tasks_approval_status ON tasks(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_status_review ON tasks(status) WHERE status = 'review';

-- ── 2. BUDGET PACING ALERTS ──
-- Track budget threshold alerts per client/ad account
CREATE TABLE IF NOT EXISTS budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES ad_accounts(id) ON DELETE SET NULL,
  threshold_pct INTEGER NOT NULL DEFAULT 80,
  current_spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  alert_type TEXT NOT NULL DEFAULT 'warning'
    CHECK (alert_type IN ('info', 'warning', 'critical', 'overspend')),
  message TEXT,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying active (unacknowledged) alerts
CREATE INDEX IF NOT EXISTS idx_budget_alerts_active ON budget_alerts(is_acknowledged, created_at DESC) WHERE is_acknowledged = FALSE;
CREATE INDEX IF NOT EXISTS idx_budget_alerts_client ON budget_alerts(client_id);

-- Enable RLS
ALTER TABLE budget_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: Team members can see all alerts
CREATE POLICY "Team can view budget alerts" ON budget_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
  );

-- RLS: Only PM/Admin can manage alerts
CREATE POLICY "PM/Admin can manage budget alerts" ON budget_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'project_manager') AND is_active = true)
  );

-- ── 3. ACTIVITY LOG trigger for approvals ──
-- (Uses existing activity_logs table)
CREATE OR REPLACE FUNCTION log_task_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) AND NEW.approval_status = 'approved' THEN
    INSERT INTO activity_logs (entity_type, entity_id, client_id, action, description, user_id)
    SELECT 'task', NEW.id, NEW.client_id, 'approved',
      'Task "' || NEW.title || '" approved', NEW.approved_by
    WHERE NEW.approved_by IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_task_approval ON tasks;
CREATE TRIGGER trg_task_approval
  AFTER UPDATE OF approval_status ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_approval();

-- ── 4. Grant permissions ──
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_alerts TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;