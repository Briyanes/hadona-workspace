-- Migration v17: Auto Email Scheduler untuk Weekly Reports
-- Table untuk schedule email otomatis ke client

CREATE TABLE IF NOT EXISTS report_email_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  cc_emails TEXT[],
  schedule_day INTEGER NOT NULL CHECK (schedule_day BETWEEN 0 AND 6),
  -- 0=Sunday, 1=Monday ... 6=Saturday
  schedule_hour INTEGER NOT NULL DEFAULT 9 CHECK (schedule_hour BETWEEN 0 AND 23),
  timezone TEXT DEFAULT 'Asia/Jakarta',
  is_active BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  last_report_id UUID,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_schedules_client ON report_email_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_email_schedules_active ON report_email_schedules(is_active, schedule_day, schedule_hour);

-- Log table untuk track email yang sudah dikirim
CREATE TABLE IF NOT EXISTS report_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES report_email_schedules(id) ON DELETE CASCADE,
  report_id UUID REFERENCES weekly_reports(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_schedule ON report_email_logs(schedule_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON report_email_logs(sent_at);

ALTER TABLE report_email_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_schedules_auth_read" ON report_email_schedules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_schedules_auth_write" ON report_email_schedules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "email_logs_auth_read" ON report_email_logs
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION update_email_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER email_schedules_updated_at
  BEFORE UPDATE ON report_email_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_email_schedules_updated_at();