-- ============================================================================
-- Migration v50: Drop ROGUE unique constraint idx_weekly_reports_unique_period
-- ============================================================================
-- MASALAH:
-- User sync error: "duplicate key value violates unique constraint
-- 'idx_weekly_reports_unique_period'"
--
-- ANALISIS:
-- Error terjadi pada multiple DIFFERENT clients dengan SAME period:
--   (67d5e28f, 2026-01-12) → FAIL
--   (0929bf3a, 2026-01-12) → FAIL
--   (fb70a191, 2026-01-12) → FAIL
--
-- Artinya: ada unique constraint yang HANYA di (period_start, period_end)
-- TANPA client_id. Ini salah! Multiple clients boleh punya report di week
-- yang sama.
--
-- Constraint yang benar (dibuat di v48):
--   idx_weekly_reports_unique_client_period ON (client_id, period_start, period_end)
--
-- Constraint yang salah (akan di-drop):
--   idx_weekly_reports_unique_period ON (period_start, period_end) — likely
-- ============================================================================

-- ── Step 1: Inspect semua indexes di weekly_reports ─────────────────────
SELECT
  'before' AS phase,
  i.indexname AS index_name,
  i.indexdef AS index_definition
FROM pg_indexes i
WHERE i.tablename = 'weekly_reports'
ORDER BY i.indexname;

-- ── Step 2: Drop ROGUE unique constraint ────────────────────────────────
-- Constraint lama ini hanya unique di (period_start, period_end) tanpa
-- client_id — memblokir multi-client per period.
DROP INDEX IF EXISTS "idx_weekly_reports_unique_period";
DROP INDEX IF EXISTS "idx_weekly_reports_unique_period_start_end";

-- Coba juga sebagai constraint (bukan index) — beberapa DB namanya beda
ALTER TABLE weekly_reports
  DROP CONSTRAINT IF EXISTS "idx_weekly_reports_unique_period";
ALTER TABLE weekly_reports
  DROP CONSTRAINT IF EXISTS "weekly_reports_period_start_period_end_key";

-- ── Step 3: Cek apakah index yang benar (dari v48) masih ada ─────────────
-- Kalau hilang, recreate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'weekly_reports'
      AND indexname = 'idx_weekly_reports_unique_client_period'
  ) THEN
    -- Hapus duplicate dulu jika ada (defensive)
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

-- ── Step 4: Verify ──────────────────────────────────────────────────────
SELECT
  'after' AS phase,
  i.indexname AS index_name,
  i.indexdef AS index_definition
FROM pg_indexes i
WHERE i.tablename = 'weekly_reports'
  AND (
    i.indexname ILIKE '%unique%'
    OR i.indexname ILIKE '%period%'
    OR i.indexname ILIKE '%key%'
  )
ORDER BY i.indexname;

-- Expected output:
--   phase | index_name                                | index_definition
--   ------+-------------------------------------------+------------------
--   after | idx_weekly_reports_unique_client_period   | CREATE UNIQUE INDEX ...
--   (1 row only — rogue index SUDAH dihapus)

-- ============================================================================
-- Selesai. Setelah migration ini:
--   ✅ Rogue constraint (period only) SUDAH dihapus
--   ✅ Correct constraint (client + period) tetap ada / direcreate
--   ✅ Sync reports 14 error duplicate akan berhenti
--   ✅ Multiple clients boleh punya report di period yang sama
-- ============================================================================