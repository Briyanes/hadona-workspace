-- ============================================
-- MIGRATION v24: Notifications System
-- ============================================

-- 1. Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 2. RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_own" ON notifications;
CREATE POLICY "notif_insert_own" ON notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 3. Enable Realtime
ALTER TABLE notifications REPLICA IDENTITY FULL;
DO $do_pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $do_pub$;

-- 4. Helper function: create notification (callable via service_role)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_link TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $func$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, link, metadata)
  VALUES (p_user_id, p_type, p_title, p_body, p_link, p_metadata);
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger function: auto-create notification when task_assignees row is inserted
CREATE OR REPLACE FUNCTION notify_task_assigned() RETURNS TRIGGER AS $trigger$
DECLARE
  v_task_title TEXT;
  v_created_by UUID;
BEGIN
  SELECT title, created_by INTO v_task_title, v_created_by
  FROM tasks WHERE id = NEW.task_id;
  
  IF NEW.user_id IS NOT NULL AND (v_created_by IS NULL OR NEW.user_id != v_created_by) THEN
    PERFORM create_notification(
      NEW.user_id,
      'task_assigned',
      'Task Baru Ditugaskan',
      v_task_title,
      '/tasks',
      jsonb_build_object('task_id', NEW.task_id)
    );
  END IF;
  RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger only if task_assignees table exists
DO $do_trigger$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_assignees') THEN
    DROP TRIGGER IF EXISTS trg_task_assigned ON task_assignees;
    EXECUTE 'CREATE TRIGGER trg_task_assigned AFTER INSERT ON task_assignees FOR EACH ROW EXECUTE FUNCTION notify_task_assigned()';
  END IF;
END $do_trigger$;

-- 6. Trigger function: notification when task status changes
CREATE OR REPLACE FUNCTION notify_task_status_change() RETURNS TRIGGER AS $trigger2$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Notify the creator that status changed (if they're not the one changing it)
    IF NEW.created_by IS NOT NULL AND NEW.created_by != auth.uid() THEN
      PERFORM create_notification(
        NEW.created_by,
        'task_updated',
        'Status Task Diperbarui',
        NEW.title || ' → ' || NEW.status,
        '/tasks',
        jsonb_build_object('task_id', NEW.id, 'status', NEW.status)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$trigger2$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_task_status ON tasks;
CREATE TRIGGER trg_task_status
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_status_change();

-- 7. Grant permissions
GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;
