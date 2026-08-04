-- Migration v50: Drop ROGUE unique constraint idx_weekly_reports_unique_period
-- Run di Supabase Dashboard > SQL Editor > Paste SEMUA isi file ini > RUN

-- Step 1: Lihat indexes yang ada sebelum di-drop
SELECT 'before' AS phase, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'weekly_reports'
ORDER BY indexname;

-- Step 2: Drop rogue constraint (period-only, tanpa client_id)
DROP INDEX IF EXISTS "idx_weekly_reports_unique_period";
DROP INDEX IF EXISTS "idx_weekly_reports_unique_period_start_end";
ALTER TABLE weekly_reports DROP CONSTRAINT IF EXISTS "idx_weekly_reports_unique_period";
ALTER TABLE weekly_reports DROP CONSTRAINT IF EXISTS "weekly_reports_period_start_period_end_key";

-- Step 3: Pastikan correct constraint (dari v48) tetap ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'weekly_reports'
      AND indexname = 'idx_weekly_reports_unique_client_period'
  ) THEN
    DELETE FROM weekly_reports a
    USING weekly_reports b
    WHERE a.id > b.id
      AND a.client_id = b.client_id
      AND a.period_start = b.period_start
      AND COALESCE(a.period_end, '1900-01-01') = COALESCE(b.period_end, '1900-01-01');

    CREATE UNIQUE INDEX idx_weekly_reports_unique_client_period
      ON weekly_reports (client_id, period_start, period_end);
  END IF;
END $$;

-- Step 4: Verify hasil akhir
SELECT 'after' AS phase, indexname, indexdef
FROM pg_indexes
WHERE tablename = 'weekly_reports'
  AND (indexname ILIKE '%unique%' OR indexname ILIKE '%period%' OR indexname ILIKE '%key%')
ORDER BY indexname;