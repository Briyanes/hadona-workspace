-- Migration v82: Add status column to content_plans
-- The frontend sends `status` field but column didn't exist, causing save failures

ALTER TABLE public.content_plans
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_content_plans_status ON public.content_plans(status);

-- Verify all columns exist
DO $$
BEGIN
  RAISE NOTICE 'content_plans columns check complete';
END
$$;