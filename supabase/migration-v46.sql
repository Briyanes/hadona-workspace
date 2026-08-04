-- ============================================================================
-- Migration v46: Add sheet import support columns
-- ============================================================================
-- Menambahkan kolom untuk support import weekly report dari Google Sheet.
--
-- Kolom baru:
--   weekly_reports.objective        — detected objective (META_SALES, etc.)
--   weekly_reports.platform         — meta/google/tiktok
--   weekly_reports.source_sheet_url — URL sheet sumber (untuk traceability)
--   report_metrics.platform         — platform metric (multi-platform report)
--
-- Index:
--   unique weekly_reports (client_id, period_start) → idempotent import
-- ============================================================================

BEGIN;

-- ─── weekly_reports: tambah kolom objective, platform, source_sheet_url ───
ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS objective TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS source_sheet_url TEXT;

-- ─── report_metrics: tambah kolom platform ───
ALTER TABLE public.report_metrics
  ADD COLUMN IF NOT EXISTS platform TEXT;

-- ─── Index idempotent: 1 client + 1 period_start = 1 report ───
-- Dipakai untuk skip duplicate saat import sheet berulang.
-- Hanya aktif untuk status 'submitted' agar draft masih boleh duplikat.
CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_reports_unique_period
  ON public.weekly_reports (client_id, period_start)
  WHERE status = 'submitted';

-- ─── Comment untuk dokumentasi ───
COMMENT ON COLUMN public.weekly_reports.objective IS 'Detected objective from sheet (META_SALES, META_CTWA, GOOGLE_PMAX, etc.)';
COMMENT ON COLUMN public.weekly_reports.platform IS 'Primary platform: meta/google/tiktok';
COMMENT ON COLUMN public.weekly_reports.source_sheet_url IS 'URL Google Sheet sumber (untuk traceability)';
COMMENT ON COLUMN public.report_metrics.platform IS 'Platform per-metric (untuk multi-platform report)';

COMMIT;

-- ============================================================================
-- VERIFY (run manual untuk check)
-- ============================================================================
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'weekly_reports'
-- ORDER BY ordinal_position;
-- ============================================================================