-- ============================================================================
-- 🎬 PRODUCTION SCHEDULES: Ensure crew & deliverables columns exist
-- ============================================================================
-- Table: production_schedules
-- Adds crew (JSONB) and deliverables (JSONB) columns if not exists
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- Ensure crew column exists (JSONB array of { name, role })
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_schedules' AND column_name = 'crew'
  ) THEN
    ALTER TABLE public.production_schedules ADD COLUMN crew JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Ensure deliverables column exists (JSONB array of strings)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'production_schedules' AND column_name = 'deliverables'
  ) THEN
    ALTER TABLE public.production_schedules ADD COLUMN deliverables JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN public.production_schedules.crew IS 'Array of crew members [{ name, role }]';
COMMENT ON COLUMN public.production_schedules.deliverables IS 'Array of deliverable items [string]';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration v83 berhasil! production_schedules.crew & deliverables siap.';
END $$;