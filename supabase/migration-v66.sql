-- ============================================
-- Migration v66: Nuclear cleanup untuk calendar events
-- 
-- Masalah: v56 trigger bisa rusak & block semua INSERT.
-- v65 fix mungkin belum di-run, atau function corrupted.
-- Migration ini: DROP SEMUA → recreate dari nol.
-- ============================================

-- ─── STEP 1: Drop semua trigger calendar_events ───
DROP TRIGGER IF EXISTS trg_log_calendar_created ON calendar_events;
DROP TRIGGER IF EXISTS trg_calendar_events_updated ON calendar_events;

-- ─── STEP 2: Drop kedua function ───
DROP FUNCTION IF EXISTS log_calendar_event_created() CASCADE;
DROP FUNCTION IF EXISTS update_calendar_events_updated_at() CASCADE;

-- ─── STEP 3: Pastikan table ada & lengkap ───
DO $$
BEGIN
  -- Cek jika table tidak ada → create
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_events') THEN
    CREATE TABLE calendar_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT NOT NULL DEFAULT 'meeting',
      start_datetime TIMESTAMPTZ NOT NULL,
      end_datetime TIMESTAMPTZ,
      all_day BOOLEAN DEFAULT false,
      client_id UUID,
      created_by UUID,
      location TEXT,
      meeting_link TEXT,
      attendees JSONB DEFAULT '[]'::jsonb,
      reminder_sent BOOLEAN DEFAULT false,
      reminder_minutes INT DEFAULT 60,
      linked_task_id UUID,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    RAISE NOTICE 'calendar_events table created';
  END IF;
END $$;

-- ─── STEP 4: Pastikan semua kolom ada (idempotent) ───
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'meeting';
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS start_datetime TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS end_datetime TIMESTAMPTZ;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS all_day BOOLEAN DEFAULT false;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS client_id UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'::jsonb;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_minutes INT DEFAULT 60;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS linked_task_id UUID;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ─── STEP 5: Add event_type constraint (drop first if exists) ───
ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
ALTER TABLE calendar_events ADD CONSTRAINT calendar_events_event_type_check 
  CHECK (event_type IN ('client_meeting', 'internal_meeting', 'review', 'follow_up', 'other', 'meeting'));

-- ─── STEP 6: Indexes ───
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);

-- ─── STEP 7: RLS ───
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_select_all" ON calendar_events;
CREATE POLICY "calendar_events_select_all" ON calendar_events
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "calendar_events_insert_all" ON calendar_events;
CREATE POLICY "calendar_events_insert_all" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "calendar_events_update_all" ON calendar_events;
CREATE POLICY "calendar_events_update_all" ON calendar_events
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "calendar_events_delete_all" ON calendar_events;
CREATE POLICY "calendar_events_delete_all" ON calendar_events
  FOR DELETE TO authenticated USING (true);

-- ─── STEP 8: Recreate updated_at trigger (SIMPLE, no activity_logs) ───
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calendar_events_updated
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_calendar_events_updated_at();

-- ─── STEP 9: Recreate activity log trigger (SAFE — never blocks insert) ───
CREATE OR REPLACE FUNCTION log_calendar_event_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if activity_logs table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
    IF NEW.created_by IS NOT NULL THEN
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata)
      VALUES (
        NEW.created_by,
        'calendar_event_created',
        'calendar_event',
        NEW.id,
        'Event "' || COALESCE(NEW.title, 'Untitled') || '" dibuat',
        jsonb_build_object('title', NEW.title, 'event_type', NEW.event_type, 'start', NEW.start_datetime)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- NEVER block the insert even if logging fails
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_calendar_created
  AFTER INSERT ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION log_calendar_event_created();

-- ─── STEP 10: Verify task_assignees table exists ───
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_assignees') THEN
    CREATE TABLE task_assignees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(task_id, user_id)
    );
    RAISE NOTICE 'task_assignees table created';
  END IF;
END $$;

-- ─── STEP 11: Add realtime ───
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS calendar_events;

-- ─── DONE ───
SELECT 'Migration v66 complete — calendar_events fully rebuilt (nuclear cleanup)' as status;