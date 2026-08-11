-- ============================================
-- MIGRATION v75: Chat Pro Features (Reactions, Mentions, Typing, Presence, Edits)
-- ============================================

-- ============================================
-- 1. ADD COLUMNS TO chat_messages
-- ============================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mentions UUID[] DEFAULT '{}';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_chat_messages_mentions ON chat_messages USING GIN(mentions);

-- ============================================
-- 2. CHAT REACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS chat_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);

ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_policy" ON chat_reactions;
CREATE POLICY "reactions_select_policy" ON chat_reactions FOR SELECT USING (true);

DROP POLICY IF EXISTS "reactions_insert_policy" ON chat_reactions;
CREATE POLICY "reactions_insert_policy" ON chat_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete_policy" ON chat_reactions;
CREATE POLICY "reactions_delete_policy" ON chat_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- 3. CHAT TYPING INDICATOR (via Realtime Broadcast - no table needed)
--    Uses Supabase Realtime presence/broadcast channel
-- ============================================

-- ============================================
-- 4. CHAT MESSAGE EDITS HISTORY
-- ============================================
CREATE TABLE IF NOT EXISTS chat_message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  old_content TEXT NOT NULL,
  edited_by UUID NOT NULL REFERENCES profiles(id),
  edited_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_edits_message ON chat_message_edits(message_id, edited_at DESC);

ALTER TABLE chat_message_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "edits_select_policy" ON chat_message_edits;
CREATE POLICY "edits_select_policy" ON chat_message_edits FOR SELECT USING (true);

-- ============================================
-- 5. UPDATE MESSAGE TYPE to include 'image', 'file'
-- ============================================
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN ('text', 'call_link', 'file', 'system', 'image'));

-- ============================================
-- 6. ADD SOFT DELETE (already exists for some, ensure chat has it)
-- ============================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================
-- 7. ENABLE REALTIME for new tables
-- ============================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- 8. UPDATE MESSAGES POLICY: Allow UPDATE (for editing own messages)
-- ============================================
DROP POLICY IF EXISTS "messages_update_policy" ON chat_messages;
CREATE POLICY "messages_update_policy" ON chat_messages
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 9. HELPER: Auto-extract mentions from content
-- ============================================
CREATE OR REPLACE FUNCTION extract_mentions(content TEXT)
RETURNS UUID[]
LANGUAGE sql
IMMUTABLE
AS $$
  -- Extract @uuid patterns - frontend will resolve display names
  -- This is a simplified version; real mention parsing happens in the API
  SELECT ARRAY[]::UUID[];
$$;