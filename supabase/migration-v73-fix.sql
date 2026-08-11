-- ============================================================
-- Migration v73-fix: Fix ad_spend_logs indexes
-- Kolom 'reach', 'results', dan 'client_id' tidak ada di schema
-- Fix: drop index gagal, recreate dengan kolom yang valid
-- ============================================================

-- 1. DROP index yang error (safe, IF EXISTS)
DROP INDEX IF EXISTS public.idx_ad_spend_logs_account_date_range;
DROP INDEX IF EXISTS public.idx_ad_spend_logs_client_date;

-- 2. RECREATE dengan hanya kolom yang PASTI ada di schema dasar (v10)
--    ad_spend_logs base columns: spend, impressions, clicks, conversions, revenue
--    (reach hanya ada jika v19 sudah di-apply; results TIDAK ADA sama sekali)
CREATE INDEX IF NOT EXISTS idx_ad_spend_logs_account_date_range
  ON public.ad_spend_logs(ad_account_id, log_date DESC)
  INCLUDE (spend, impressions, clicks);

-- 3. Index untuk sync dedup check (account + date unique lookup) — ini sudah benar
--    (Tidak perlu diubah, sudah ada dari v73)

-- ANALYZE ulang
ANALYZE public.ad_spend_logs;