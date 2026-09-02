-- ═══════════════════════════════════════════════════════════
-- Migration v106: Notifikasi Assignee saat Status Task Berubah
-- ═══════════════════════════════════════════════════════════
--
-- MASALAH:
--   v24: notify_task_status_change() hanya memberi tahu CREATOR.
--   v26: menimpa fungsi dengan INSERT ke kolom yang TIDAK ADA
--        (message/entity_type/entity_id/action_url) → rusak.
--
-- SOLUSI:
--   Rewrite memakai create_notification() (kolom benar):
--     1. Status → 'review'  : assignee dapat "Task Perlu Review" (task_review)
--     2. Status → 'blocked' : assignee dapat "Task Diblokir" (task_blocked)
--     3. Status lain        : tetap notif creator (perilaku v24)
--   Notifikasi otomatis ter-kirim web push via relay (v104).
--   Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_task_status_change()
RETURNS TRIGGER AS $func$
DECLARE
  v_actor UUID;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_actor := auth.uid();

    -- KASUS 1: pindah ke REVIEW → kabari semua assignee
    IF NEW.status = 'review' THEN
      PERFORM create_notification(
        ta.user_id,
        'task_review',
        'Task Perlu Review',
        'Task "' || NEW.title || '" dipindahkan ke Review',
        '/tasks',
        jsonb_build_object('task_id', NEW.id, 'status', NEW.status)
      )
      FROM task_assignees ta
      WHERE ta.task_id = NEW.id
        AND ta.user_id IS DISTINCT FROM v_actor
        AND ta.user_id IS DISTINCT FROM NEW.created_by;

      IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_actor THEN
        PERFORM create_notification(
          NEW.created_by,
          'task_review',
          'Task Perlu Review',
          'Task "' || NEW.title || '" dipindahkan ke Review',
          '/tasks',
          jsonb_build_object('task_id', NEW.id, 'status', NEW.status)
        );
      END IF;

    -- KASUS 2: pindah ke BLOCKED → kabari semua assignee
    ELSIF NEW.status = 'blocked' THEN
      PERFORM create_notification(
        ta.user_id,
        'task_blocked',
        'Task Diblokir',
        'Task "' || NEW.title || '" status: blocked',
        '/tasks',
        jsonb_build_object('task_id', NEW.id, 'status', NEW.status)
      )
      FROM task_assignees ta
      WHERE ta.task_id = NEW.id
        AND ta.user_id IS DISTINCT FROM v_actor
        AND ta.user_id IS DISTINCT FROM NEW.created_by;

      IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_actor THEN
        PERFORM create_notification(
          NEW.created_by,
          'task_blocked',
          'Task Diblokir',
          'Task "' || NEW.title || '" status: blocked',
          '/tasks',
          jsonb_build_object('task_id', NEW.id, 'status', NEW.status)
        );
      END IF;

    -- KASUS 3: perubahan status lain → notif creator (perilaku v24)
    ELSE
      IF NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_actor THEN
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
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_task_status ON tasks;

DROP TRIGGER IF EXISTS trg_task_status ON tasks;
CREATE TRIGGER trg_task_status
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_status_change();
