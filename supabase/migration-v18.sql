-- Migration v18: Creative Performance Tracker + Security
-- Track performance per creative/ad untuk insight mana creative performing

CREATE TABLE IF NOT EXISTS creative_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES weekly_reports(id) ON DELETE CASCADE,
  creative_name TEXT NOT NULL,
  creative_type TEXT CHECK (creative_type IN ('image', 'video', 'carousel', 'collection', 'story', 'reel')),
  platform TEXT DEFAULT 'META' CHECK (platform IN ('META', 'Google', 'TikTok')),
  thumbnail_url TEXT,
  metrics JSONB DEFAULT '{}'::jsonb,
  -- metrics bisa berisi: spend, impressions, clicks, ctr, conversions, cpr, roas, frequency
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'under_review', 'exhausted')),
  is_winner BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creative_report ON creative_performance(report_id);
CREATE INDEX IF NOT EXISTS idx_creative_winner ON creative_performance(report_id, is_winner);

ALTER TABLE creative_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_perf_auth" ON creative_performance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at (reuse existing function)
CREATE TRIGGER creative_perf_updated_at
  BEFORE UPDATE ON creative_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_email_schedules_updated_at();

-- ─── Security: Atomic increment view_count untuk shared_reports ───
-- Mencegah race condition saat multiple concurrent access
CREATE OR REPLACE FUNCTION increment_view_count(token_input TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE shared_reports
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE token = token_input AND is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;