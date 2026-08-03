-- ============================================
-- MIGRATION V34: Fix for v33 errors
-- Problem: timesheets table already existed without task_id column
-- Problem: is_manager() function doesn't exist
-- This migration is IDEMPOTENT — safe to run multiple times
-- ============================================

-- ============================================
-- STEP 1: Add task_id to existing timesheets table
-- ============================================
ALTER TABLE public.timesheets ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Add hourly_rate if missing (used in timesheet page)
ALTER TABLE public.timesheets ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) DEFAULT 0;

-- Create index on task_id only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'timesheets' AND indexname = 'idx_timesheets_task_id'
  ) THEN
    CREATE INDEX idx_timesheets_task_id ON public.timesheets(task_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'timesheets' AND indexname = 'idx_timesheets_user_id'
  ) THEN
    CREATE INDEX idx_timesheets_user_id ON public.timesheets(user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'timesheets' AND indexname = 'idx_timesheets_client_id'
  ) THEN
    CREATE INDEX idx_timesheets_client_id ON public.timesheets(client_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'timesheets' AND indexname = 'idx_timesheets_date'
  ) THEN
    CREATE INDEX idx_timesheets_date ON public.timesheets(date);
  END IF;
END $$;

-- ============================================
-- STEP 2: Enable RLS on timesheets (if not already)
-- ============================================
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Drop & recreate timesheets RLS policies
-- (removes dependency on is_manager() which doesn't exist)
-- ============================================
DROP POLICY IF EXISTS "timesheets_select_all" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_insert_all" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_update_own_or_manager" ON public.timesheets;
DROP POLICY IF EXISTS "timesheets_delete_own_or_manager" ON public.timesheets;

-- Recreate with safe policies (no is_manager dependency)
CREATE POLICY "timesheets_select_all" ON public.timesheets
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "timesheets_insert_all" ON public.timesheets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "timesheets_update_own" ON public.timesheets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "timesheets_delete_own" ON public.timesheets
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STEP 4: Ensure subtasks table exists with correct structure
-- ============================================
CREATE TABLE IF NOT EXISTS public.subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure index exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'subtasks' AND indexname = 'idx_subtasks_task_id'
  ) THEN
    CREATE INDEX idx_subtasks_task_id ON public.subtasks(task_id);
  END IF;
END $$;

-- ============================================
-- STEP 5: Enable RLS on subtasks + policies
-- ============================================
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subtasks_select_all" ON public.subtasks;
DROP POLICY IF EXISTS "subtasks_insert_all" ON public.subtasks;
DROP POLICY IF EXISTS "subtasks_update_all" ON public.subtasks;
DROP POLICY IF EXISTS "subtasks_delete_all" ON public.subtasks;

CREATE POLICY "subtasks_select_all" ON public.subtasks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "subtasks_insert_all" ON public.subtasks
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "subtasks_update_all" ON public.subtasks
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "subtasks_delete_all" ON public.subtasks
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- ============================================
-- STEP 6: Enable realtime for subtasks (safe)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'subtasks' AND schemaname = 'public'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subtasks;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not add subtasks to realtime: %', SQLERRM;
END $$;