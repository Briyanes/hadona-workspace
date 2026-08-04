-- ============================================================================
-- Migration v53: Fix Unique Index untuk Multi-Platform Reports
-- ============================================================================
-- BUG: Index lama (v47) `idx_weekly_reports_unique_client_period` hanya memakai
-- (client_id, period_start, period_end). Akibatnya, jika 1 client punya 2 weekly
-- report di period yang sama tapi platform BERBEDA (mis. "Meta ADS" + "Google ADS"
-- untuk minggu 19-25 Jan 2026), insert kedua akan gagal / di-skip sebagai duplikat.
--
-- EFEK NYATA DI PRODUCTION: 164 row di sheet Janury-Juli '26 ter-skip sebagai
-- "dedup" karena key = client_id|period_start tidak include platform.
--
-- FIX: Recreate unique index dengan composite key 4 kolom:
--   (client_id, period_start, period_end, platform)
-- Sehingga Meta + Google + TikTok di minggu yang sama dianggap entry terpisah.
--
-- Author: Tim Hadona (3 Advertiser + 5 Web Dev + 2 UI/UX)
-- ============================================================================

BEGIN;

-- ─── Step 1: Drop index lama (3 kolom, tanpa platform) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_weekly_reports_unique_client_period'
  ) THEN
    DROP INDEX idx_weekly_reports_unique_client_period;
    RAISE NOTICE '✅ Dropped old index idx_weekly_reports_unique_client_period';
  ELSE
    RAISE NOTICE 'ℹ️ Old index not found, skipping drop';
  END IF;
END $$;

-- ─── Step 2: Drop juga index v46 kalau masih ada (sudah di-drop di v47 tapi defensive) ───
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_weekly_reports_unique_period'
  ) THEN
    DROP INDEX idx_weekly_reports_unique_period;
    RAISE NOTICE '✅ Dropped legacy v46 index idx_weekly_reports_unique_period';
  END IF;
END $$;

-- ─── Step 3: Create new unique index dengan composite key 4 kolom ──────────
-- Partial index: hanya untuk rows yang punya semua 4 field (defensive).
-- Rows dengan platform NULL tetap bisa ada (data lama), tapi unique check
-- hanya apply kalau semua 4 kolom NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_unique_client_period_platform
  ON weekly_reports(client_id, period_start, period_end, platform)
  WHERE client_id IS NOT NULL
    AND period_start IS NOT NULL
    AND period_end IS NOT NULL
    AND platform IS NOT NULL;

-- ─── Step 4: Backfill platform untuk report lama yang NULL ─────────────────
-- Beberapa report lama mungkin masih platform=NULL. Kita coba derive dari
-- objective (META_CTWA → META, GOOGLE_ADS → Google, dll) supaya bisa masuk
-- unique constraint baru juga (best-effort, tidak fatal kalau gagal).
UPDATE weekly_reports
SET platform = CASE
    WHEN objective ILIKE '%META%' OR objective ILIKE '%FACEBOOK%' OR objective ILIKE '%INSTAGRAM%' THEN 'META'
    WHEN objective ILIKE '%GOOGLE%' OR objective ILIKE '%YOUTUBE%' THEN 'Google'
    WHEN objective ILIKE '%TIKTOK%' THEN 'TikTok'
    ELSE 'META'  -- default fallback (mayoritas data historis adalah Meta)
  END
WHERE platform IS NULL
  AND client_id IS NOT NULL
  AND period_start IS NOT NULL
  AND period_end IS NOT NULL;

-- ─── Step 5: Verifikasi tidak ada duplicate (client, period, platform) ────
-- Jika masih ada duplicates (mis. dari data sync sebelumnya yang double-insert),
-- tampilkan warning tapi jangan block migration.
DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT client_id, period_start, period_end, platform, COUNT(*) AS cnt
    FROM weekly_reports
    WHERE client_id IS NOT NULL AND period_start IS NOT NULL
      AND period_end IS NOT NULL AND platform IS NOT NULL
    GROUP BY client_id, period_start, period_end, platform
    HAVING COUNT(*) > 1
  ) dups;

  IF dup_count > 0 THEN
    RAISE WARNING '⚠️ Found % duplicate (client, period, platform) groups. Run dedup cleanup if needed.', dup_count;
  ELSE
    RAISE NOTICE '✅ No duplicates found. Index v53 ready.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION CHECK (run manual):
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE tablename = 'weekly_reports' AND indexname LIKE 'idx_weekly_reports_unique%';
-- Expected:
--   idx_weekly_reports_unique_client_period_platform (4 columns)
-- ============================================================================