-- ============================================
-- MIGRATION v86: Monthly Reports Module
-- Fitur: Upload & kelola laporan bulanan (file PDF/xlsx/dll) per client
-- - Tabel monthly_reports (link ke clients & tasks)
-- - Storage bucket "monthly-reports"
-- - RLS policies
-- ============================================

-- 1. Tabel utama monthly_reports
CREATE TABLE IF NOT EXISTS public.monthly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted | reviewed
  file_url TEXT NOT NULL,
  file_key TEXT,
  file_name TEXT,
  file_size BIGINT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, period_month, period_year)
);

-- 2. Indexes untuk performa query
CREATE INDEX IF NOT EXISTS idx_monthly_reports_client ON public.monthly_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_task ON public.monthly_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON public.monthly_reports(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_created_by ON public.monthly_reports(created_by);

-- 3. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_monthly_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monthly_reports_updated_at ON public.monthly_reports;
CREATE TRIGGER trg_monthly_reports_updated_at
  BEFORE UPDATE ON public.monthly_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_monthly_reports_updated_at();

-- 4. RLS
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_reports_select_all" ON public.monthly_reports;
CREATE POLICY "monthly_reports_select_all" ON public.monthly_reports
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "monthly_reports_insert_own" ON public.monthly_reports;
CREATE POLICY "monthly_reports_insert_own" ON public.monthly_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "monthly_reports_update_all" ON public.monthly_reports;
CREATE POLICY "monthly_reports_update_all" ON public.monthly_reports
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "monthly_reports_delete_all" ON public.monthly_reports;
CREATE POLICY "monthly_reports_delete_all" ON public.monthly_reports
  FOR DELETE TO authenticated USING (true);

-- 5. Storage bucket "monthly-reports" (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('monthly-reports', 'monthly-reports', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies
DROP POLICY IF EXISTS "monthly_reports_bucket_read" ON storage.objects;
CREATE POLICY "monthly_reports_bucket_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'monthly-reports');

DROP POLICY IF EXISTS "monthly_reports_bucket_insert" ON storage.objects;
CREATE POLICY "monthly_reports_bucket_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'monthly-reports');

DROP POLICY IF EXISTS "monthly_reports_bucket_delete" ON storage.objects;
CREATE POLICY "monthly_reports_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'monthly-reports');