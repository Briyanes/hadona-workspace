-- Migration v68: Calendar Events — Reschedule & Cancel Support
-- Adds google_event_id for sync with Google Calendar
-- Adds status for soft-delete (cancel) tracking

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Index for faster filtering (only show active events)
CREATE INDEX IF NOT EXISTS idx_calendar_events_status
  ON calendar_events(status);