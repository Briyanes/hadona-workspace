-- ============================================
-- Migration V10: Ads Spend Improvements
-- 1. Add pic_id to ad_accounts (account manager/PIC)
-- 2. Create ad_spend_logs table (daily spend tracking)
-- ============================================

BEGIN;

-- ============================================
-- 1. Add pic_id column to ad_accounts
-- ============================================
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS pic_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for PIC lookups
CREATE INDEX IF NOT EXISTS idx_ad_accounts_pic_id ON public.ad_accounts(pic_id);

-- Update RLS: keep existing, pic can update their own accounts
CREATE POLICY "ad_accounts_update_pic"
  ON public.ad_accounts FOR UPDATE TO authenticated
  USING (pic_id = auth.uid())
  WITH CHECK (true);

-- ============================================
-- 2. Create ad_spend_logs table
-- ============================================
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

CREATE POLICY "ad_spend_logs_select_all"
  ON public.ad_spend_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ad_spend_logs_insert_all"
  ON public.ad_spend_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ad_spend_logs_update_all"
  ON public.ad_spend_logs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "ad_spend_logs_delete_all"
  ON public.ad_spend_logs FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS trg_ad_spend_logs_updated ON public.ad_spend_logs;
CREATE TRIGGER trg_ad_spend_logs_updated BEFORE UPDATE ON public.ad_spend_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_spend_logs;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 3. Auto-update remaining_budget when spend log is inserted
-- ============================================
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