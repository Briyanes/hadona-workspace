-- Migration v16: Goal Tracking & Target untuk Client
-- Field target CPA, ROAS, monthly budget untuk performance comparison

-- Tabel goals per client (bisa multiple goals per bulan)
CREATE TABLE IF NOT EXISTS client_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('roas', 'cpa', 'spend', 'conversions', 'ctr', 'cpr')),
  target_value NUMERIC NOT NULL,
  period_type TEXT DEFAULT 'monthly' CHECK (period_type IN ('weekly', 'monthly', 'quarterly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_goals_client_id ON client_goals(client_id);
CREATE INDEX IF NOT EXISTS idx_client_goals_period ON client_goals(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_client_goals_active ON client_goals(is_active) WHERE is_active = true;

ALTER TABLE client_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_goals_auth_read" ON client_goals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "client_goals_auth_insert" ON client_goals
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "client_goals_auth_update" ON client_goals
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "client_goals_auth_delete" ON client_goals
  FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION update_client_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_goals_updated_at
  BEFORE UPDATE ON client_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_client_goals_updated_at();