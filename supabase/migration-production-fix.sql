-- ============================================================================
-- 🚀 PRODUCTION FIX MIGRATION (v10-v14 Combined)
-- ============================================================================
-- File ini menggabungkan migration v10-v14 jadi 1 file untuk kemudahan.
-- AMAN dijalankan berulang (idempotent) — jalankan di Supabase SQL Editor.
--
-- CARA PAKAI:
--   1. Buka Supabase Dashboard → SQL Editor
--   2. Copy-paste SELURUH file ini
--   3. Klik RUN
--   4. Cek output — semua harus "success" tanpa error
--
-- SETELAH RUN: Halaman /ads-spend & /reports akan berfungsi penuh.
-- ============================================================================

-- Reload schema cache di awal (memastikan PostgREST aware)
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 1. ad_accounts: Tambah kolom pic_id, meta_sync_enabled, meta_connection_id
--    (dari migration-v10 & v11)
-- ============================================================================

-- pic_id (PIC/Account Manager)
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS pic_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_pic_id ON public.ad_accounts(pic_id);

-- Meta sync columns
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS meta_sync_enabled BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ad_accounts' AND column_name = 'meta_connection_id'
  ) THEN
    ALTER TABLE public.ad_accounts
      ADD COLUMN meta_connection_id UUID REFERENCES public.meta_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- 2. ad_spend_logs table (daily spend tracking)
--    (dari migration-v10)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ad_spend_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id UUID NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  spend NUMERIC(14,2) NOT NULL DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  conversions NUMERIC(10,2) DEFAULT 0,
  revenue NUMERIC(14,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_logs_account_date ON public.ad_spend_logs(ad_account_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_spend_logs_date ON public.ad_spend_logs(log_date DESC);

ALTER TABLE public.ad_spend_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_spend_logs_select_all" ON public.ad_spend_logs;
CREATE POLICY "ad_spend_logs_select_all"
  ON public.ad_spend_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ad_spend_logs_insert_all" ON public.ad_spend_logs;
CREATE POLICY "ad_spend_logs_insert_all"
  ON public.ad_spend_logs FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ad_spend_logs_update_all" ON public.ad_spend_logs;
CREATE POLICY "ad_spend_logs_update_all"
  ON public.ad_spend_logs FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "ad_spend_logs_delete_all" ON public.ad_spend_logs;
CREATE POLICY "ad_spend_logs_delete_all"
  ON public.ad_spend_logs FOR DELETE TO authenticated USING (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ad_spend_logs_updated ON public.ad_spend_logs;
CREATE TRIGGER trg_ad_spend_logs_updated BEFORE UPDATE ON public.ad_spend_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_spend_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update remaining_budget saat spend log di-insert/update
CREATE OR REPLACE FUNCTION public.update_remaining_budget()
RETURNS TRIGGER AS $$
DECLARE
  v_daily_budget NUMERIC;
BEGIN
  SELECT daily_budget INTO v_daily_budget
  FROM public.ad_accounts WHERE id = NEW.ad_account_id;

  IF v_daily_budget IS NOT NULL THEN
    UPDATE public.ad_accounts
    SET remaining_budget = GREATEST(COALESCE(remaining_budget, 0) - NEW.spend, 0)
    WHERE id = NEW.ad_account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_remaining_budget ON public.ad_spend_logs;
CREATE TRIGGER trg_update_remaining_budget
  AFTER INSERT OR UPDATE OF spend ON public.ad_spend_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_remaining_budget();

-- ============================================================================
-- 3. meta_connections table (OAuth token storage)
--    (dari migration-v11)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  fb_user_id TEXT NOT NULL,
  fb_user_name TEXT,
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  ad_accounts_cache JSONB DEFAULT '[]'::jsonb,
  auto_sync BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, fb_user_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_user_id ON public.meta_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_connections_client_id ON public.meta_connections(client_id);
CREATE INDEX IF NOT EXISTS idx_meta_connections_active ON public.meta_connections(is_active, auto_sync);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_connections_select_own_or_manager" ON public.meta_connections;
CREATE POLICY "meta_connections_select_own_or_manager"
  ON public.meta_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_manager());

DROP POLICY IF EXISTS "meta_connections_insert_own" ON public.meta_connections;
CREATE POLICY "meta_connections_insert_own"
  ON public.meta_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "meta_connections_update_own_or_manager" ON public.meta_connections;
CREATE POLICY "meta_connections_update_own_or_manager"
  ON public.meta_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_manager());

DROP POLICY IF EXISTS "meta_connections_delete_own_or_manager" ON public.meta_connections;
CREATE POLICY "meta_connections_delete_own_or_manager"
  ON public.meta_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_manager());

DROP TRIGGER IF EXISTS update_meta_connections_updated_at ON public.meta_connections;
CREATE TRIGGER update_meta_connections_updated_at BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_connections;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 4. meta_sync_logs table (audit trail)
--    (dari migration-v11)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.meta_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  sync_date DATE NOT NULL DEFAULT CURRENT_DATE,
  records_pulled INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_sync_logs_connection ON public.meta_sync_logs(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_sync_logs_date ON public.meta_sync_logs(sync_date DESC);

ALTER TABLE public.meta_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_sync_logs_select_all" ON public.meta_sync_logs;
CREATE POLICY "meta_sync_logs_select_all"
  ON public.meta_sync_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "meta_sync_logs_insert_service" ON public.meta_sync_logs;
CREATE POLICY "meta_sync_logs_insert_service"
  ON public.meta_sync_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- 5. ad_accounts: client_id nullable + currency/timezone/created_at
--    (dari migration-v12)
-- ============================================================================

ALTER TABLE public.ad_accounts ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ============================================================================
-- 6. RLS Fix: ad_accounts (allow all authenticated staff)
--    (dari migration-v13)
-- ============================================================================

DROP POLICY IF EXISTS "ad_accounts_write_manager" ON public.ad_accounts;
DROP POLICY IF EXISTS "ad_accounts_update_pic" ON public.ad_accounts;
DROP POLICY IF EXISTS "ad_accounts_select_all" ON public.ad_accounts;
DROP POLICY IF EXISTS "ad_accounts_insert_all" ON public.ad_accounts;
DROP POLICY IF EXISTS "ad_accounts_update_all" ON public.ad_accounts;
DROP POLICY IF EXISTS "ad_accounts_delete_manager" ON public.ad_accounts;

CREATE POLICY "ad_accounts_select_all" ON public.ad_accounts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ad_accounts_insert_all" ON public.ad_accounts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ad_accounts_update_all" ON public.ad_accounts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "ad_accounts_delete_manager" ON public.ad_accounts
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============================================================================
-- 7. RLS Fix: clients (allow all authenticated staff untuk insert/update)
--    (dari migration-v13 & v14)
-- ============================================================================

DROP POLICY IF EXISTS "clients_write_manager" ON public.clients;
DROP POLICY IF EXISTS "clients_select_all" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_all" ON public.clients;
DROP POLICY IF EXISTS "clients_update_all" ON public.clients;
DROP POLICY IF EXISTS "clients_delete_manager" ON public.clients;

CREATE POLICY "clients_select_all" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "clients_insert_all" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "clients_update_all" ON public.clients
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "clients_delete_manager" ON public.clients
  FOR DELETE TO authenticated USING (public.is_manager());

-- ============================================================================
-- 8. clients: logo_url column
--    (dari migration-v14)
-- ============================================================================

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

-- ============================================================================
-- 9. RLS Fix: report_metrics (allow PIC weekly_report owner)
--    (dari migration-v14)
-- ============================================================================

DROP POLICY IF EXISTS "report_metrics_write_manager" ON public.report_metrics;
DROP POLICY IF EXISTS "report_metrics_select_all" ON public.report_metrics;
DROP POLICY IF EXISTS "report_metrics_insert_pic_or_manager" ON public.report_metrics;
DROP POLICY IF EXISTS "report_metrics_update_pic_or_manager" ON public.report_metrics;
DROP POLICY IF EXISTS "report_metrics_delete_pic_or_manager" ON public.report_metrics;

CREATE POLICY "report_metrics_select_all" ON public.report_metrics
  FOR SELECT TO authenticated USING (true);

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

-- ============================================================================
-- 10. report_metrics: platform column & index
--     (dari migration-v14)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'report_metrics' AND column_name = 'platform'
  ) THEN
    ALTER TABLE public.report_metrics ADD COLUMN platform TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_report_metrics_type
  ON public.report_metrics(weekly_report_id, metric_type);

-- ============================================================================
-- 11. weekly_reports: updated_at trigger
--     (dari migration-v14)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_reports' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.weekly_reports ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_weekly_reports_updated_at ON public.weekly_reports;
CREATE TRIGGER update_weekly_reports_updated_at BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DONE
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- Output summary (akan muncul di SQL Editor results)
DO $$
BEGIN
  RAISE NOTICE '✅ Migration v10-v14 berhasil dijalankan!';
  RAISE NOTICE 'Tabel & kolom yang seharusnya sekarang ada:';
  RAISE NOTICE '  - ad_accounts.pic_id';
  RAISE NOTICE '  - ad_accounts.meta_sync_enabled';
  RAISE NOTICE '  - ad_accounts.meta_connection_id';
  RAISE NOTICE '  - ad_accounts.currency, timezone, created_at';
  RAISE NOTICE '  - ad_spend_logs (tabel baru)';
  RAISE NOTICE '  - meta_connections (tabel baru)';
  RAISE NOTICE '  - meta_sync_logs (tabel baru)';
  RAISE NOTICE '  - clients.logo_url';
  RAISE NOTICE '  - report_metrics.platform';
  RAISE NOTICE '  - weekly_reports.updated_at';
  RAISE NOTICE 'RLS policies updated untuk ad_accounts, clients, report_metrics';
END $$;