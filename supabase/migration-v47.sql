-- ============================================================================
-- Migration v47: Weekly Reports Sync Metadata (Multi-Sheet Auto-Sync)
-- ============================================================================
-- Menambah kolom untuk tracking auto-sync dari Google Sheet multi-tab:
--   - last_synced_at: timestamp sinkronisasi terakhir dari sheet
--   - sheet_source: nama sheet asal (mis. "Janury '26", "Mei '26")
--   - sheet_gid: Google Sheet tab ID untuk traceability
--
-- Catatan: kolom `platform` dan `source_sheet_url` SUDAH ADA di schema existing
-- (lihat migration v45). Migration ini hanya menambah metadata sync.
-- ============================================================================

-- Step 1: Tambah kolom sync metadata ke weekly_reports
ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sheet_source TEXT,
  ADD COLUMN IF NOT EXISTS sheet_gid TEXT;

-- Step 2: Index untuk query efisien
CREATE INDEX IF NOT EXISTS idx_weekly_reports_synced ON weekly_reports(last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_sheet_source ON weekly_reports(sheet_source);

-- Step 3: Composite index untuk filter " semua report Meta CTWA bulan ini"
-- (kolom platform & objective sudah ada di schema existing)
CREATE INDEX IF NOT EXISTS idx_weekly_reports_platform_objective
  ON weekly_reports(platform, objective)
  WHERE objective IS NOT NULL;

-- Step 4: Drop & recreate dedup index (idempotent upsert untuk cron)
-- Index v46 sudah ada `idx_weekly_reports_unique_client_period` — kita recreate
-- dengan partial WHERE clause agar tidak bentrok dengan row manual (client_id NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_weekly_reports_unique_client_period'
  ) THEN
    DROP INDEX idx_weekly_reports_unique_client_period;
  END IF;
END $$;

CREATE UNIQUE INDEX idx_weekly_reports_unique_client_period
  ON weekly_reports(client_id, period_start, period_end)
  WHERE client_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL;

-- Step 5: Comment untuk dokumentasi
COMMENT ON COLUMN weekly_reports.last_synced_at IS 'Timestamp sinkronisasi terakhir dari Google Sheet (auto-sync cron)';
COMMENT ON COLUMN weekly_reports.sheet_source IS 'Nama sheet asal (mis. "Janury ''26", "Mei ''26")';
COMMENT ON COLUMN weekly_reports.sheet_gid IS 'Google Sheet tab ID untuk traceability';

-- ============================================================================
-- Selesai
-- ============================================================================