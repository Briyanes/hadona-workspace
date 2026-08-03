-- ============================================
-- MIGRATION V35: Add approval columns to tasks table
-- Problem: v33 was rolled back due to timesheets error
--          so approval columns were never created
-- This is IDEMPOTENT — safe to run multiple times
-- ============================================

-- Add approval workflow columns to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approval_note TEXT;

-- Create index for approval_status filtering (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'tasks' AND indexname = 'idx_tasks_approval_status'
  ) THEN
    CREATE INDEX idx_tasks_approval_status ON public.tasks(approval_status);
  END IF;
END $$;

-- Verify columns exist
DO $$
BEGIN
  RAISE NOTICE 'Migration v35 complete. Checking columns...';
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'approval_status'
  ) THEN
    RAISE NOTICE '✅ tasks.approval_status EXISTS';
  ELSE
    RAISE NOTICE '❌ tasks.approval_status MISSING';
  END IF;
END $$;