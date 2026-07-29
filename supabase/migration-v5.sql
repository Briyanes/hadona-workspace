-- ============================================
-- MIGRATION V5: Task Comments & Subtasks
-- ============================================

-- Task Comments table (untuk kolaborasi di dalam task)
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Subtasks table (untuk checklist di dalam task)
CREATE TABLE IF NOT EXISTS public.subtasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON public.task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks(task_id);

-- Enable RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies untuk task_comments (semua user internal bisa CRUD)
CREATE POLICY "Users can read task comments" ON public.task_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert task comments" ON public.task_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own task comments" ON public.task_comments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own task comments" ON public.task_comments FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies untuk subtasks
CREATE POLICY "Users can read subtasks" ON public.subtasks FOR SELECT USING (true);
CREATE POLICY "Users can insert subtasks" ON public.subtasks FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update subtasks" ON public.subtasks FOR UPDATE USING (true);
CREATE POLICY "Users can delete subtasks" ON public.subtasks FOR DELETE USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subtasks;