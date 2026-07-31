-- ============================================
-- Migration V14: Fix RLS report_metrics untuk PIC (Advertiser)
--
-- BUG: report_metrics_write_manager hanya allow manager.
--      Padahal advertiser (PIC) adalah pembuat weekly report.
--      Saat fitur structured metrics aktif, advertiser diblokir input.
--
-- FIX: Allow PIC weekly_report owner & manager untuk write metrics.
-- ============================================

BEGIN;

-- Drop policy lama yang terlalu ketat
DROP POLICY IF EXISTS "report_metrics_write_manager" ON public.report_metrics;

-- Buat policy baru:
-- 1. SELECT: semua authenticated staff (sudah ada, pastikan)
DROP POLICY IF EXISTS "report_metrics_select_all" ON public.report_metrics;
CREATE POLICY "report_metrics_select_all" ON public.report_metrics
  FOR SELECT TO authenticated USING (true);

-- 2. INSERT: PIC weekly_report owner atau manager
CREATE POLICY "report_metrics_insert_pic_or_manager" ON public.report_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = report_metrics.weekly_report_id
      AND wr.pic_id = auth.uid()
    )
  );

-- 3. UPDATE: PIC weekly_report owner atau manager
CREATE POLICY "report_metrics_update_pic_or_manager" ON public.report_metrics
  FOR UPDATE TO authenticated
  USING (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = report_metrics.weekly_report_id
      AND wr.pic_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = report_metrics.weekly_report_id
      AND wr.pic_id = auth.uid()
    )
  );

-- 4. DELETE: PIC weekly_report owner atau manager
CREATE POLICY "report_metrics_delete_pic_or_manager" ON public.report_metrics
  FOR DELETE TO authenticated
  USING (
    public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.weekly_reports wr
      WHERE wr.id = report_metrics.weekly_report_id
      AND wr.pic_id = auth.uid()
    )
  );

COMMIT;

-- ============================================
-- Tambahkan kolom pic_id di report_metrics untuk audit (siapa input metric)
-- Dan kolom platform untuk segmentasi (META/Google/TikTok)
-- ============================================

BEGIN;

-- Cek apakah kolom sudah ada sebelum add (idempotent)
DO $$
BEGIN
  -- Tambah kolom platform (opsional, untuk breakdown per platform)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_metrics' AND column_name = 'platform'
  ) THEN
    ALTER TABLE public.report_metrics ADD COLUMN platform TEXT;
  END IF;

  -- Tambah kolom period (agar metric tahu periode weekly report)
  -- (opsional, untuk query cepat tanpa join)
END $$;

COMMIT;

-- ============================================
-- Index untuk performa query metrics per report
-- ============================================
CREATE INDEX IF NOT EXISTS idx_report_metrics_type
  ON public.report_metrics(weekly_report_id, metric_type);

-- ============================================
-- Tambahan: updated_at trigger untuk weekly_reports
-- ============================================
DROP TRIGGER IF EXISTS update_weekly_reports_updated_at ON public.weekly_reports;

-- Tambah kolom updated_at di weekly_reports jika belum ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_reports' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.weekly_reports ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

CREATE TRIGGER update_weekly_reports_updated_at BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FIX BUG: Kolom logo_url belum ada di clients table
-- Frontend mengirim logo_url tapi kolom tidak ada → "Unknown error"
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE public.clients ADD COLUMN logo_url TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public.clients.logo_url IS 'URL logo client (R2/S3 storage)';
