-- ═══════════════════════════════════════════════════════════
-- Migration v26: Task-Timesheet Link + Assignment Notifications
-- ═══════════════════════════════════════════════════════════

-- ── 1. LINK TIMESHEETS TO TASKS ──
ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_timesheets_task_id ON timesheets(task_id) WHERE task_id IS NOT NULL;

-- ── 2. TASK ASSIGNMENT NOTIFICATION TRIGGER ──
-- Auto-create notification when a task is assigned to a user
CREATE OR REPLACE FUNCTION notify_task_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when a new assignment is created
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, action_url)
    SELECT
      NEW.user_id,
      'task_assigned',
      'Task Baru Diberikan',
      'Anda diassign ke sebuah task. Klik untuk melihat detail.',
      'task',
      NEW.task_id,
      '/tasks'
    WHERE NEW.user_id != auth.uid(); -- Don't notify self
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_task_assignment ON task_assignees;
CREATE TRIGGER trg_notify_task_assignment
  AFTER INSERT ON task_assignees
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_assignment();

-- ── 3. TASK STATUS CHANGE NOTIFICATION ──
-- Notify assignees when task status changes (e.g., moved to review/blocked)
CREATE OR REPLACE FUNCTION notify_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status IN ('review', 'blocked') THEN
    -- Insert notifications for all assignees
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, action_url)
    SELECT
      ta.user_id,
      CASE WHEN NEW.status = 'review' THEN 'task_review' ELSE 'task_blocked' END,
      CASE WHEN NEW.status = 'review' THEN 'Task Perlu Review' ELSE 'Task Diblokir' END,
      'Task "' || NEW.title || '" status: ' || NEW.status,
      'task',
      NEW.id,
      '/tasks'
    FROM task_assignees ta
    WHERE ta.task_id = NEW.id
      AND ta.user_id != auth.uid();
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_task_status ON tasks;
CREATE TRIGGER trg_notify_task_status
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_status_change();

-- ── 4. APPROVAL NOTIFICATION ──
-- Notify task creator when approval status changes
CREATE OR REPLACE FUNCTION notify_task_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.approval_status IS DISTINCT FROM NEW.approval_status) AND NEW.approval_status IN ('approved', 'rejected', 'changes_requested') THEN
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, action_url)
    SELECT
      NEW.created_by,
      'task_approval',
      CASE WHEN NEW.approval_status = 'approved' THEN 'Task Disetujui!'
           WHEN NEW.approval_status = 'rejected' THEN 'Task Ditolak'
           ELSE 'Perubahan Diminta' END,
      'Task "' || NEW.title || '" - ' || REPLACE(NEW.approval_status, '_', ' '),
      'task',
      NEW.id,
      '/tasks'
    WHERE NEW.created_by IS NOT NULL AND NEW.created_by != auth.uid();
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_task_approval ON tasks;
CREATE TRIGGER trg_notify_task_approval
  AFTER UPDATE OF approval_status ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_approval();