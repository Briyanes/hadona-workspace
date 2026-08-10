-- ============================================
-- MIGRATION v72: Team Chat (Slack-like) + Video Call Integration
-- ============================================

-- Channel types: 'general' | 'division' | 'dm' | 'announcement'
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'division', 'dm', 'announcement')),
  division TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_channels_type ON chat_channels(type);
CREATE INDEX IF NOT EXISTS idx_chat_channels_division ON chat_channels(division);

-- Messages with type support (text, call_link, file, system)
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'call_link', 'file', 'system')),
  metadata JSONB DEFAULT '{}',
  reply_to UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(message_type);

-- Read receipts for unread tracking
CREATE TABLE IF NOT EXISTS chat_read_receipts (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

-- ============================================
-- SEED DEFAULT CHANNELS
-- ============================================
INSERT INTO chat_channels (name, type) VALUES
  ('general', 'general'),
  ('announcement', 'announcement')
ON CONFLICT DO NOTHING;

INSERT INTO chat_channels (name, type, division)
SELECT 'performance', 'division', 'performance'
WHERE NOT EXISTS (SELECT 1 FROM chat_channels WHERE name = 'performance' AND type = 'division');

INSERT INTO chat_channels (name, type, division)
SELECT 'creative', 'division', 'creative'
WHERE NOT EXISTS (SELECT 1 FROM chat_channels WHERE name = 'creative' AND type = 'division');

INSERT INTO chat_channels (name, type, division)
SELECT 'strategy', 'division', 'strategy'
WHERE NOT EXISTS (SELECT 1 FROM chat_channels WHERE name = 'strategy' AND type = 'division');

-- ============================================
-- ENABLE REALTIME
-- (DO $$ blocks handle case where tables are already in the publication)
-- ============================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_read_receipts;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's divisions
-- NOTE: profiles.division is a single TEXT column, so we wrap it in an array
CREATE OR REPLACE FUNCTION get_user_divisions()
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE
    WHEN division IS NOT NULL THEN ARRAY[division]
    ELSE ARRAY[]::TEXT[]
  END
  FROM profiles WHERE id = auth.uid();
$$;

-- CHANNELS: Users can see general, announcement, their division channels, and DMs
DROP POLICY IF EXISTS "channels_select_policy" ON chat_channels;
CREATE POLICY "channels_select_policy" ON chat_channels
  FOR SELECT USING (
    type IN ('general', 'announcement')
    OR (type = 'division' AND division = ANY(get_user_divisions()))
    OR created_by = auth.uid()
  );

-- CHANNELS: super_admin and project_manager can create channels
DROP POLICY IF EXISTS "channels_insert_policy" ON chat_channels;
CREATE POLICY "channels_insert_policy" ON chat_channels
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'project_manager')
    )
  );

-- MESSAGES: Users can read messages in channels they have access to
DROP POLICY IF EXISTS "messages_select_policy" ON chat_messages;
CREATE POLICY "messages_select_policy" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_channels c
      WHERE c.id = channel_id
      AND (
        c.type IN ('general', 'announcement')
        OR (c.type = 'division' AND c.division = ANY(get_user_divisions()))
        OR c.created_by = auth.uid()
      )
    )
  );

-- MESSAGES: Authenticated users can post in accessible channels
DROP POLICY IF EXISTS "messages_insert_policy" ON chat_messages;
CREATE POLICY "messages_insert_policy" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM chat_channels c
      WHERE c.id = channel_id
      AND (
        c.type IN ('general', 'announcement')
        OR (c.type = 'division' AND c.division = ANY(get_user_divisions()))
        OR c.created_by = auth.uid()
      )
    )
  );

-- MESSAGES: Users can delete their own messages
DROP POLICY IF EXISTS "messages_delete_policy" ON chat_messages;
CREATE POLICY "messages_delete_policy" ON chat_messages
  FOR DELETE USING (auth.uid() = user_id);

-- READ RECEIPTS: Users manage their own
DROP POLICY IF EXISTS "receipts_select_policy" ON chat_read_receipts;
CREATE POLICY "receipts_select_policy" ON chat_read_receipts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "receipts_upsert_policy" ON chat_read_receipts;
CREATE POLICY "receipts_upsert_policy" ON chat_read_receipts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "receipts_update_policy" ON chat_read_receipts;
CREATE POLICY "receipts_update_policy" ON chat_read_receipts
  FOR UPDATE USING (auth.uid() = user_id);