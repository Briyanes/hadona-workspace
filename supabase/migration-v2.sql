-- ============================================
-- HADONA WORKSPACE - MIGRATION V2
-- Fixes & new columns for P0+P1 features
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. FIX: Add created_by to creative_requests (security fix)
-- ============================================
ALTER TABLE public.creative_requests
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.creative_requests
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.creative_requests
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Backfill created_by from existing data (set to first manager if null)
UPDATE public.creative_requests
SET created_by = (SELECT id FROM public.profiles WHERE role IN ('super_admin', 'project_manager') LIMIT 1)
WHERE created_by IS NULL;

-- ============================================
-- 2. NEW TABLE: Daily spend log (for ad accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS public.daily_spend (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ad_account_id UUID NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  spend_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  impressions BIGINT,
  clicks BIGINT,
  conversions NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, spend_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_spend_account ON public.daily_spend(ad_account_id);
CREATE INDEX IF NOT EXISTS idx_daily_spend_date ON public.daily_spend(spend_date);

-- ============================================
-- 3. RLS for new table
-- ============================================
ALTER TABLE public.daily_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_spend_select_all" ON public.daily_spend
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "daily_spend_write_manager" ON public.daily_spend
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ============================================
-- 4. FIX: creative_requests RLS policies (security fix)
-- ============================================
DROP POLICY IF EXISTS "creative_requests_insert_all" ON public.creative_requests;
DROP POLICY IF EXISTS "creative_requests_update_all_or_manager" ON public.creative_requests;
DROP POLICY IF EXISTS "creative_requests_delete_manager" ON public.creative_requests;

-- All staff can read
CREATE POLICY "creative_requests_select_all" ON public.creative_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only authenticated users can insert, must set created_by to themselves
CREATE POLICY "creative_requests_insert_auth" ON public.creative_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

-- Creator or assigned person or manager can update
CREATE POLICY "creative_requests_update_creator_or_assigned_or_manager" ON public.creative_requests
  FOR UPDATE USING (
    auth.uid() = created_by
    OR auth.uid() = assigned_to
    OR public.is_manager()
  );

-- Creator or manager can delete
CREATE POLICY "creative_requests_delete_creator_or_manager" ON public.creative_requests
  FOR DELETE USING (auth.uid() = created_by OR public.is_manager());

-- ============================================
-- 5. ENABLE REALTIME for daily_spend
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_spend;