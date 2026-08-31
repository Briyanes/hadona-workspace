-- ============================================================
-- Migration v102: Task Deliverables (upload file besar via Google Drive)
-- Mirror creative_deliverables, tapi untuk tasks (task_id, bukan creative_request_id)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.task_deliverables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  drive_file_id TEXT,
  drive_web_view_link TEXT,
  drive_web_content_link TEXT,
  drive_folder_id TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index untuk query per-task
CREATE INDEX IF NOT EXISTS idx_task_deliverables_task_id
  ON public.task_deliverables(task_id);

-- Unique version per task
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_deliverables_task_version
  ON public.task_deliverables(task_id, version);

-- Enable RLS
ALTER TABLE public.task_deliverables ENABLE ROW LEVEL SECURITY;

-- Policies (konsisten dengan creative_deliverables di migration-v85)
DROP POLICY IF EXISTS "task_deliverables_select_authenticated" ON public.task_deliverables;
CREATE POLICY "task_deliverables_select_authenticated" ON public.task_deliverables
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "task_deliverables_insert_authenticated" ON public.task_deliverables;
CREATE POLICY "task_deliverables_insert_authenticated" ON public.task_deliverables
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "task_deliverables_update_authenticated" ON public.task_deliverables;
CREATE POLICY "task_deliverables_update_authenticated" ON public.task_deliverables
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "task_deliverables_delete_authenticated" ON public.task_deliverables;
CREATE POLICY "task_deliverables_delete_authenticated" ON public.task_deliverables
  FOR DELETE TO authenticated
  USING (true);