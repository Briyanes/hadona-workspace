-- Migration v32: Creative Revision Tracking
-- Adds revision history for creative requests (multi-round review workflow)

CREATE TABLE IF NOT EXISTS creative_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creative_request_id UUID NOT NULL REFERENCES creative_requests(id) ON DELETE CASCADE,
  revision_round INTEGER NOT NULL DEFAULT 1,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_progress', 'resolved')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_creative_revisions_request_id ON creative_revisions(creative_request_id);
CREATE INDEX IF NOT EXISTS idx_creative_revisions_created_at ON creative_revisions(created_at DESC);

-- Auto-increment revision round per creative request
CREATE OR REPLACE FUNCTION get_next_revision_round(req_id UUID)
RETURNS INTEGER AS $$
DECLARE
  max_round INTEGER;
BEGIN
  SELECT COALESCE(MAX(revision_round), 0) INTO max_round
  FROM creative_revisions
  WHERE creative_request_id = req_id;
  RETURN max_round + 1;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE creative_revisions ENABLE ROW LEVEL SECURITY;

-- Same RLS as creative_requests (all authenticated users can see)
CREATE POLICY "Authenticated can read revisions" ON creative_revisions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert revisions" ON creative_revisions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update revisions" ON creative_revisions
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete revisions" ON creative_revisions
  FOR DELETE TO authenticated USING (true);