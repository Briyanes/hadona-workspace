-- Migration v101 — Trigger sinkronisasi Task Editor → Content Plan (arah balik)
--
-- Latar: sinkronisasi plan→task sudah ditangani app layer (src/lib/content-plan-sync.ts).
-- Arah balik (editor drag task jadi done di Task Manager) harus ikut mengubah
-- progress content plan jadi "done" — tanpa itu, plan tetap "Proses Edit" padahal
-- editor sudah selesai (laporan user: status tidak sinkron).
--
-- Link plan↔task: tasks.sheet_row_id = 'content_plan:<plan_id>'
--
-- Aturan trigger (hanya saat STATUS task berubah):
--   task → done          : plan.progress = 'done'
--   task done → todo/in_progress (undo drag): plan.progress = 'proses_edit'
--   task → blocked       : TIDAK di-map ke 'cancel' (blocked dipakai utk berbagai hold,
--                          mis. menunggu aset — memaksa plan jadi cancel bisa salah)
--
-- Jalankan manual di Supabase SQL Editor (jalur DDL programatik terblokir —
-- lihat DEPLOY-V99.md). Idempotent — aman dijalankan berulang.

-- 1) Fungsi sinkronisasi
CREATE OR REPLACE FUNCTION public.sync_task_to_content_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  -- Hanya task yang ter-link ke content plan
  IF NEW.sheet_row_id IS NULL OR NEW.sheet_row_id NOT LIKE 'content_plan:%' THEN
    RETURN NEW;
  END IF;

  -- Hanya bereaksi bila status berubah
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_plan_id := substring(NEW.sheet_row_id from 14)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW; -- format tidak valid, abaikan
  END;

  -- Editor menandai selesai → plan ikut done
  IF NEW.status = 'done' THEN
    UPDATE public.content_plans
       SET progress = 'done'
     WHERE id = v_plan_id
       AND progress <> 'done';

  -- Undo drag (done → todo/in_progress) → plan kembali Proses Edit
  ELSIF OLD.status = 'done' AND NEW.status IN ('todo', 'in_progress') THEN
    UPDATE public.content_plans
       SET progress = 'proses_edit'
     WHERE id = v_plan_id
       AND progress = 'done';
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Trigger pada tasks (drop-dulu agar idempotent)
DROP TRIGGER IF EXISTS trg_task_to_content_plan ON public.tasks;
CREATE TRIGGER trg_task_to_content_plan
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_to_content_plan();