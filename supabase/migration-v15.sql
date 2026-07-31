-- Migration v15: Shared Reports (Client Portal)
-- Tabel untuk shareable report links dengan token

CREATE TABLE IF NOT EXISTS shared_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES profiles(id),
  expires_at TIMESTAMPTZ,
  view_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk lookup by token (fast)
CREATE INDEX IF NOT EXISTS idx_shared_reports_token ON shared_reports(token);
CREATE INDEX IF NOT EXISTS idx_shared_reports_report_id ON shared_reports(report_id);

-- RLS: 
-- - Internal team bisa create/read (via service role API)
-- - Public route pakai service role (bypass RLS)
ALTER TABLE shared_reports ENABLE ROW LEVEL SECURITY;

-- Policy: hanya yang sudah login bisa lihat list share links
CREATE POLICY "shared_reports_auth_read" ON shared_reports
  FOR SELECT TO authenticated
  USING (true);

-- Policy: hanya yang sudah login bisa create
CREATE POLICY "shared_reports_auth_insert" ON shared_reports
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Policy: creator atau siapapun yang login bisa update/delete
CREATE POLICY "shared_reports_auth_update" ON shared_reports
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "shared_reports_auth_delete" ON shared_reports
  FOR DELETE TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_shared_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shared_reports_updated_at
  BEFORE UPDATE ON shared_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_shared_reports_updated_at();