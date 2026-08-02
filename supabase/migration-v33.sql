-- ============================================
-- MIGRATION V33: Task approval, subtasks & timesheets
-- Adds missing columns/tables that task-detail-modal.tsx references
-- ============================================

-- 1. Add approval workflow columns to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approval_note TEXT;

-- Index for approval_status filtering
CREATE INDEX IF NOT EXISTS idx_tasks_approval_status ON public.tasks(approval_status);

-- 2. Create subtasks table
CREATE TABLE IF NOT EXISTS public.subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);

-- 3. Create timesheets table (if not already exists)
CREATE TABLE IF NOT EXISTS public.timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  activity_type TEXT DEFAULT 'general',
  description TEXT,
  billable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheets_user_id ON public.timesheets(user_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_task_id ON public.timesheets(task_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_client_id ON public.timesheets(client_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_date ON public.timesheets(date);

-- 4. Enable RLS on new tables
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for subtasks (all staff can read, all can create/update/delete)
CREATE POLICY "subtasks_select_all" ON public.subtasks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "subtasks_insert_all" ON public.subtasks
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "subtasks_update_all" ON public.subtasks
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "subtasks_delete_all" ON public.subtasks
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- 6. RLS Policies for timesheets
CREATE POLICY "timesheets_select_all" ON public.timesheets
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "timesheets_insert_all" ON public.timesheets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "timesheets_update_own_or_manager" ON public.timesheets
  FOR UPDATE USING (auth.uid() = user_id OR public.is_manager());
CREATE POLICY "timesheets_delete_own_or_manager" ON public.timesheets
  FOR DELETE USING (auth.uid() = user_id OR public.is_manager());

-- 7. Enable realtime for subtasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.subtasks;