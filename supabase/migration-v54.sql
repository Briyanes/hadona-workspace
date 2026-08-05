-- ============================================================================
-- Migration v54: Tambah kolom data_status & data_source_kind di weekly_reports
-- ============================================================================
-- TUJUAN (P3 Null-Metric Handler):
--   Saat ini sync engine SKIP semua baris yang tidak punya metric (noMetrics).
--   Akibatnya, weekly report "narrative-only" (mis. notes organic growth tanpa
--   angka) hilang dari dashboard — padahal user tetap mau lihat record tersebut.
--
--   Dengan kolom `data_status`, sync engine tetap insert report kosong dengan
--   flag:
--     - 'ok'             → report normal dengan metrics
--     - 'no_metrics'     → ada performance_text tapi tanpa angka (notes only)
--     - 'partial'        → ada beberapa metric, tapi key metrics missing
--     - 'synced_error'   → sync gagal parse sebagian, data mungkin unreliable
--
--   `data_source_kind` bedakan sumber:
--     - 'sheet_auto'     → di-import otomatis dari Google Sheet
--     - 'sheet_manual'   → di-import manual via "Import Sheet" button
--     - 'manual_entry'   → diketik manual user via form
--
-- Author: Tim Hadona (3 Advertiser + 5 Web Dev + 2 UI/UX)
-- ============================================================================

BEGIN;

-- ─── Step 1: Tambah kolom data_status dengan DEFAULT 'ok' ────────────────
-- DEFAULT 'ok' supaya semua report lama otomatis dianggap "ok" tanpa backfill.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_reports' AND column_name = 'data_status'
  ) THEN
    ALTER TABLE weekly_reports
      ADD COLUMN data_status VARCHAR(20) NOT NULL DEFAULT 'ok';
    RAISE NOTICE '✅ Added column weekly_reports.data_status (default: ok)';
  ELSE
    RAISE NOTICE 'ℹ️ Column data_status already exists, skipping';
  END IF;
END $$;

-- ─── Step 2: Tambah kolom data_source_kind ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_reports' AND column_name = 'data_source_kind'
  ) THEN
    ALTER TABLE weekly_reports
      ADD COLUMN data_source_kind VARCHAR(20) NOT NULL DEFAULT 'sheet_auto';
    RAISE NOTICE '✅ Added column weekly_reports.data_source_kind (default: sheet_auto)';
  ELSE
    RAISE NOTICE 'ℹ️ Column data_source_kind already exists, skipping';
  END IF;
END $$;

-- ─── Step 3: Add CHECK constraint untuk valid value ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_reports_data_status_check'
  ) THEN
    ALTER TABLE weekly_reports
      ADD CONSTRAINT weekly_reports_data_status_check
      CHECK (data_status IN ('ok', 'no_metrics', 'partial', 'synced_error'));
    RAISE NOTICE '✅ Added CHECK constraint weekly_reports_data_status_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_reports_data_source_kind_check'
  ) THEN
    ALTER TABLE weekly_reports
      ADD CONSTRAINT weekly_reports_data_source_kind_check
      CHECK (data_source_kind IN ('sheet_auto', 'sheet_manual', 'manual_entry'));
    RAISE NOTICE '✅ Added CHECK constraint weekly_reports_data_source_kind_check';
  END IF;
END $$;

-- ─── Step 4: Index untuk filter cepat report bermasalah ──────────────────
-- Berguna untuk halaman "Reports needing attention" di dashboard.
CREATE INDEX IF NOT EXISTS idx_weekly_reports_data_status
  ON weekly_reports(data_status)
  WHERE data_status != 'ok';

-- ─── Step 5: Backfill existing reports ───────────────────────────────────
-- Report yang TIDAK punya report_metrics → set 'no_metrics' (best-effort).
-- Hanya lakukan jika ada data (hindari full table scan kosong).
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE weekly_reports wr
  SET data_status = 'no_metrics'
  WHERE wr.data_status = 'ok'
    AND NOT EXISTS (
      SELECT 1 FROM report_metrics rm WHERE rm.weekly_report_id = wr.id
    )
    AND (wr.performance_text IS NULL OR wr.performance_text = '');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Backfilled % empty reports to data_status=no_metrics', updated_count;
END $$;

-- ─── Step 6: Drop dan recreate unique index v53 ──────────────────────────
-- Tidak ada perubahan — index v53 sudah include composite key yang benar
-- (client_id, period_start, period_end, platform). Hanya pastikan masih ada.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_weekly_reports_unique_client_period_platform'
  ) THEN
    CREATE UNIQUE INDEX idx_weekly_reports_unique_client_period_platform
      ON weekly_reports(client_id, period_start, period_end, platform)
      WHERE client_id IS NOT NULL
        AND period_start IS NOT NULL
        AND period_end IS NOT NULL
        AND platform IS NOT NULL;
    RAISE NOTICE '✅ Recreated v53 unique index';
  ELSE
    RAISE NOTICE 'ℹ️ v53 unique index already exists';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION CHECK (run manual):
-- SELECT data_status, COUNT(*) FROM weekly_reports GROUP BY data_status;
-- Expected:
--   ok          | N  (reports with metrics)
--   no_metrics  | M  (reports imported but no metrics parsed)
-- ============================================================================

-- ============================================================================
-- VERIFIKASI SCHEMA:
-- \d weekly_reports
-- Kolom baru akan muncul di bagian bawah:
--   data_status       | character varying(20) | not null default 'ok'
--   data_source_kind  | character varying(20) | not null default 'sheet_auto'
-- ============================================================================