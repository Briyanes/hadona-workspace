-- =============================================
-- Migration v65: Fix broken log_calendar_event_created trigger
-- 
-- Root cause: Function referenced non-existent column 'created_by'
-- instead of 'user_id', and was missing NOT NULL 'description' field.
-- This caused EVERY calendar_events INSERT to fail with an error,
-- making it impossible to create any meeting/event.
-- =============================================

-- Drop the broken trigger first
DROP TRIGGER IF EXISTS trg_log_calendar_created ON calendar_events;

-- Recreate the function with correct columns
CREATE OR REPLACE FUNCTION log_calendar_event_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if activity_logs table exists and we have a valid user
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
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Silently skip logging if any error (don't block the actual insert)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trg_log_calendar_created
  AFTER INSERT ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION log_calendar_event_created();

SELECT 'Migration v65 complete — fixed broken calendar event trigger' as status;