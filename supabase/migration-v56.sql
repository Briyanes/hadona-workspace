-- ============================================
-- Migration v56: Calendar Events (Meeting Management)
-- Tabel untuk input manual agenda/event di calendar
-- Support: client meeting, internal meeting, review, follow up
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  
  -- Event type
  event_type TEXT NOT NULL DEFAULT 'meeting' 
    CHECK (event_type IN ('client_meeting', 'internal_meeting', 'review', 'follow_up', 'other')),
  
  -- Date & Time
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  
  -- Relations
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Meeting details
  location TEXT,
  meeting_link TEXT, -- Zoom/Google Meet link
  attendees JSONB DEFAULT '[]'::jsonb, -- [{ user_id, name, email, role }]
  
  -- Follow-up
  reminder_sent BOOLEAN DEFAULT false,
  reminder_minutes INT DEFAULT 60, -- reminder X minutes before
  
  -- Task integration
  linked_task_id UUID, -- if auto-created task for PM
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON calendar_events(created_by);

-- Enable RLS
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can see events (team calendar)
CREATE POLICY "calendar_events_select_all" ON calendar_events
  FOR SELECT TO authenticated USING (true);

-- Policy: All authenticated users can create events
CREATE POLICY "calendar_events_insert_all" ON calendar_events
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policy: Creator or any user can update (collaborative)
CREATE POLICY "calendar_events_update_all" ON calendar_events
  FOR UPDATE TO authenticated USING (true);

-- Policy: All authenticated can delete
CREATE POLICY "calendar_events_delete_all" ON calendar_events
  FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at
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

-- Add to activity log when event created
CREATE OR REPLACE FUNCTION log_calendar_event_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_logs (action, entity_type, entity_id, metadata, created_by)
  VALUES (
    'calendar_event_created',
    'calendar_event',
    NEW.id,
    jsonb_build_object('title', NEW.title, 'event_type', NEW.event_type, 'start', NEW.start_datetime),
    NEW.created_by
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if activity_logs table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_logs') THEN
    DROP TRIGGER IF EXISTS trg_log_calendar_created ON calendar_events;
    CREATE TRIGGER trg_log_calendar_created
      AFTER INSERT ON calendar_events
      FOR EACH ROW EXECUTE FUNCTION log_calendar_event_created();
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Skip if activity_logs doesn't exist
  NULL;
END $$;

SELECT 'Migration v56 complete — calendar_events table created' as status;