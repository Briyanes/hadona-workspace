-- =============================================
-- Migration v64: Google Calendar API Integration
-- - Store Google OAuth tokens per user
-- - Store Google event ID + Meet code on calendar_events
-- =============================================

-- Table for storing Google OAuth tokens per user
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date BIGINT,
  scope TEXT,
  token_type TEXT DEFAULT 'Bearer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add Google Calendar fields to calendar_events
ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_meet_code TEXT;

-- RLS policies
ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User can read own google tokens" ON google_oauth_tokens;
CREATE POLICY "User can read own google tokens" ON google_oauth_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can insert own google tokens" ON google_oauth_tokens;
CREATE POLICY "User can insert own google tokens" ON google_oauth_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can update own google tokens" ON google_oauth_tokens;
CREATE POLICY "User can update own google tokens" ON google_oauth_tokens
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User can delete own google tokens" ON google_oauth_tokens;
CREATE POLICY "User can delete own google tokens" ON google_oauth_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_google_tokens_updated ON google_oauth_tokens;
CREATE TRIGGER trigger_google_tokens_updated
  BEFORE UPDATE ON google_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_google_tokens_updated_at();

-- Allow users to update google_event_id and google_meet_code on their own events
-- (calendar_events RLS should already allow insert/update by created_by)

SELECT 'Migration v64 complete — Google Calendar integration tables created' as status;