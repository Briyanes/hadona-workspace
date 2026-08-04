-- ============================================================================
-- Migration v48: Dedup weekly_reports + Create Unique Index (SAFE)
-- ============================================================================
-- MASALAH:
-- Migration v47 step 4 gagal dengan error:
--   "could not create unique index idx_weekly_reports_unique_client_period"
--   "Key (client_id, period_start, period_end)=(..., 2026-06-29, 2026-07-06) is duplicated"
--
-- ROOT CAUSE:
-- Sync berjalan beberapa kali (manual + cron + retry) sebelum unique index
-- aktif. Karena v2 batch insert TIDAK punya unique constraint di DB untuk
-- mencegah duplikat, beberapa rows dengan kombinasi (client_id, period_start,
-- period_end) yang sama tersimpan.
--
-- SOLUSI:
-- 1. ADD COLUMN last_synced_at, sheet_source, sheet_gid (dari v47)
-- 2. DEDUP existing rows (keep latest by created_at)
-- 3. CREATE UNIQUE INDEX (idempotent upsert untuk sync berikutnya)
-- ============================================================================

-- ── Step 1: Tambah kolom metadata sync (dari v47, masih perlu) ───────────
ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sheet_source TEXT,
  ADD COLUMN IF NOT EXISTS sheet_gid TEXT;

CREATE INDEX IF NOT EXISTS idx_weekly_reports_synced
  ON weekly_reports(last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_sheet_source
  ON weekly_reports(sheet_source);

-- ── Step 2: DEDUP — Keep latest created_at per (client_id, period_start, period_end) ─
-- PENTING: Hanya dedup row dengan semua 3 kolom NOT NULL. Row manual (tanpa
-- period_end) tidak di-touch.
--
-- Strategi: ROW_NUMBER() partition by key, keep rn=1 (latest), delete rn>1.

BEGIN;

-- 2a. Preview berapa row yang akan dihapus (info saja)
SELECT
  'rows_to_delete' AS info,
  COUNT(*) AS count
FROM (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY client_id, period_start, period_end
      ORDER BY created_at DESC, updated_at DESC
    ) AS rn
  FROM weekly_reports
  WHERE client_id IS NOT NULL
    AND period_start IS NOT NULL
    AND period_end IS NOT NULL
) t
WHERE rn > 1;

-- 2b. Hapus duplicates (keep latest per group)
DELETE FROM weekly_reports
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY client_id, period_start, period_end
        ORDER BY created_at DESC, updated_at DESC
      ) AS rn
    FROM weekly_reports
    WHERE client_id IS NOT NULL
      AND period_start IS NOT NULL
      AND period_end IS NOT NULL
  ) t
  WHERE rn > 1
);

-- 2c. Hapus juga report_metrics yang orphaned (just in case)
DELETE FROM report_metrics
WHERE weekly_report_id NOT IN (
  SELECT id FROM weekly_reports
);

COMMIT;

-- ── Step 3: Drop unique index lama jika ada (idempotent) ─────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_weekly_reports_unique_client_period'
  ) THEN
    DROP INDEX idx_weekly_reports_unique_client_period;
  END IF;
END $$;

-- ── Step 4: Create unique index (sekarang aman karena sudah dedup) ───────
CREATE UNIQUE INDEX idx_weekly_reports_unique_client_period
  ON weekly_reports(client_id, period_start, period_end)
  WHERE client_id IS NOT NULL
    AND period_start IS NOT NULL
    AND period_end IS NOT NULL;

-- ── Step 5: Verify (cek bahwa tidak ada duplicate lagi) ──────────────────
SELECT
  'verification' AS info,
  COUNT(*) AS duplicate_groups_remaining
FROM (
  SELECT client_id, period_start, period_end, COUNT(*) AS cnt
  FROM weekly_reports
  WHERE client_id IS NOT NULL
    AND period_start IS NOT NULL
    AND period_end IS NOT NULL
  GROUP BY client_id, period_start, period_end
  HAVING COUNT(*) > 1
) d;

-- ── Step 6: Comment untuk dokumentasi ────────────────────────────────────
COMMENT ON COLUMN weekly_reports.last_synced_at IS 'Timestamp sync terakhir dari Google Sheet';
COMMENT ON COLUMN weekly_reports.sheet_source IS 'Nama sheet asal (mis. "Mei ''26")';
COMMENT ON COLUMN weekly_reports.sheet_gid IS 'Google Sheet tab ID';

-- ============================================================================
-- Selesai. Setelah migration ini:
--   ✅ Kolom metadata sync tersedia
--   ✅ Tidak ada duplicate rows
--   ✅ Unique index aktif → sync berikutnya idempotent via upsert
-- ============================================================================