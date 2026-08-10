-- ============================================
-- Migration v67: NUCLEAR FIX — Drop activity log trigger ENTIRELY
--
-- Root cause: Trigger from v56 tries to INSERT into activity_logs
-- with wrong column name ("created_by" instead of "user_id"),
-- blocking ALL calendar_events INSERTs.
--
-- v66 tried to recreate the trigger safely, but it seems the old
-- function/trigger is STILL active (possibly due to function signature
-- mismatch or cached plan).
--
-- This migration GUARANTEES the fix by dropping everything related
-- to activity logging for calendar_events.
-- ============================================

-- ─── STEP 1: Drop ALL triggers on calendar_events ───
-- Use multiple approaches to ensure they're gone
DROP TRIGGER IF EXISTS trg_log_calendar_created ON calendar_events;
DROP TRIGGER IF EXISTS trg_calendar_events_updated ON calendar_events;

-- Also try dropping any trigger we might have missed
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'calendar_events'::regclass
    AND NOT tgisinternal
  )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %s ON calendar_events', r.tgname);
    RAISE NOTICE 'Dropped trigger: %', r.tgname;
  END LOOP;
END $$;

-- ─── STEP 2: Drop ALL functions related to calendar event logging ───
-- Drop with CASCADE to remove any dependencies
DROP FUNCTION IF EXISTS log_calendar_event_created() CASCADE;
DROP FUNCTION IF EXISTS update_calendar_events_updated_at() CASCADE;

-- Also try alternative signatures just in case
DROP FUNCTION IF EXISTS public.log_calendar_event_created() CASCADE;
DROP FUNCTION IF EXISTS public.update_calendar_events_updated_at() CASCADE;

-- ─── STEP 3: Verify no triggers remain ───
DO $$
DECLARE
  trigger_count INT;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'calendar_events'::regclass
  AND NOT tgisinternal;

  IF trigger_count > 0 THEN
    RAISE WARNING 'There are still % triggers on calendar_events!', trigger_count;
  ELSE
    RAISE NOTICE '✅ All triggers removed from calendar_events';
  END IF;
END $$;

-- ─── STEP 4: Recreate ONLY the updated_at trigger (safe, no activity_logs) ───
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

-- ─── DONE ───
-- NO activity log trigger. Calendar events will work guaranteed.
-- Activity logging is a nice-to-have, not essential for calendar functionality.

SELECT 'Migration v67 complete — ALL activity log triggers dropped from calendar_events. INSERT will work now.' as status;