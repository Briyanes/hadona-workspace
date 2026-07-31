-- ============================================================================
-- 🎯 MIGRATION v19: Objective-Aware Metrics System
-- ============================================================================
-- Menambahkan kolom extended metrics untuk support CPAS, CTWA, CTLP objectives
-- + kolom objective di ad_accounts, weekly_reports, creative_performance
--
-- CARA PAKAI: Jalankan di Supabase SQL Editor
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 1. ad_spend_logs: Tambah 12 kolom extended metrics (CPAS/CTWA/CTLP support)
-- ============================================================================
DO $$
BEGIN
  -- Awareness & Engagement
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'reach') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN reach BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'link_clicks') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN link_clicks BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'outbound_clicks') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN outbound_clicks BIGINT DEFAULT 0;
  END IF;

  -- CTWA Core Metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'messaging_conversations_started') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN messaging_conversations_started BIGINT DEFAULT 0;
  END IF;

  -- CPAS / Sales Funnel Metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'content_views') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN content_views BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'adds_to_cart') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN adds_to_cart BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'purchases') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN purchases BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'purchase_value') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN purchase_value NUMERIC(14,2) DEFAULT 0;
  END IF;

  -- CTLP Metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'landing_page_views') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN landing_page_views BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'checkouts_initiated') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN checkouts_initiated BIGINT DEFAULT 0;
  END IF;

  -- Instagram Traffic Metrics
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'instagram_follows') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN instagram_follows BIGINT DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_spend_logs' AND column_name = 'instagram_profile_visits') THEN
    ALTER TABLE public.ad_spend_logs ADD COLUMN instagram_profile_visits BIGINT DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 2. ad_accounts: Tambah kolom objective
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ad_accounts' AND column_name = 'objective') THEN
    ALTER TABLE public.ad_accounts ADD COLUMN objective TEXT DEFAULT 'SALES';
  END IF;
END $$;

-- ============================================================================
-- 3. weekly_reports: Tambah kolom objective (snapshot di waktu report)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_reports' AND column_name = 'objective') THEN
    ALTER TABLE public.weekly_reports ADD COLUMN objective TEXT DEFAULT 'SALES';
  END IF;
END $$;

-- ============================================================================
-- 4. creative_performance: Tambah kolom objective
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creative_performance' AND column_name = 'objective') THEN
    ALTER TABLE public.creative_performance ADD COLUMN objective TEXT DEFAULT 'SALES';
  END IF;
END $$;

-- ============================================================================
-- 5. report_metrics: Tambah kolom objective (untuk filter saat display)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'report_metrics' AND column_name = 'objective') THEN
    ALTER TABLE public.report_metrics ADD COLUMN objective TEXT;
  END IF;
END $$;

-- ============================================================================
-- 6. Index untuk query objective-aware
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ad_accounts_objective ON public.ad_accounts(objective);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_objective ON public.weekly_reports(objective);
CREATE INDEX IF NOT EXISTS idx_report_metrics_objective ON public.report_metrics(objective);

-- ============================================================================
-- 7. Backfill existing data: Set objective berdasarkan platform/heuristic
-- ============================================================================
-- Default SALES untuk existing ad_accounts (paling umum di agency)
UPDATE public.ad_accounts SET objective = 'SALES' WHERE objective IS NULL;
UPDATE public.weekly_reports SET objective = 'SALES' WHERE objective IS NULL;
UPDATE public.creative_performance SET objective = 'SALES' WHERE objective IS NULL;

-- ============================================================================
-- DONE
-- ============================================================================
NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration v19 berhasil dijalankan!';
  RAISE NOTICE 'Kolom baru di ad_spend_logs:';
  RAISE NOTICE '  - reach, link_clicks, outbound_clicks';
  RAISE NOTICE '  - messaging_conversations_started (CTWA)';
  RAISE NOTICE '  - content_views, adds_to_cart, purchases, purchase_value (CPAS)';
  RAISE NOTICE '  - landing_page_views, checkouts_initiated (CTLP)';
  RAISE NOTICE '  - instagram_follows, instagram_profile_visits';
  RAISE NOTICE 'Kolom objective di: ad_accounts, weekly_reports, creative_performance, report_metrics';
END $$;