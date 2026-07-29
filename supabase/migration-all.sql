-- ============================================
-- HADONA WORKSPACE - MIGRATION ALL-IN-ONE
-- Isi: Migration v2 + v3 + v4 (digabung)
-- Run SEKALI di Supabase SQL Editor
-- AMAN dijalankan ulang (semua pakai IF NOT EXISTS)
-- ============================================

-- ============================================
-- === MIGRATION v2 ===
-- ============================================

-- 1. ADD columns to creative_requests (security fix)
ALTER TABLE public.creative_requests
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.creative_requests
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.creative_requests
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Backfill created_by from existing data
UPDATE public.creative_requests
SET created_by = (SELECT id FROM public.profiles WHERE role IN ('super_admin', 'project_manager') LIMIT 1)
WHERE created_by IS NULL;

-- 2. NEW TABLE: daily_spend (for ad accounts)
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

-- 3. RLS for daily_spend
ALTER TABLE public.daily_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_spend_select_all" ON public.daily_spend
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "daily_spend_write_manager" ON public.daily_spend
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- 4. FIX: creative_requests RLS policies
DROP POLICY IF EXISTS "creative_requests_insert_all" ON public.creative_requests;
DROP POLICY IF EXISTS "creative_requests_update_all_or_manager" ON public.creative_requests;
DROP POLICY IF EXISTS "creative_requests_delete_manager" ON public.creative_requests;

CREATE POLICY "creative_requests_select_all" ON public.creative_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "creative_requests_insert_auth" ON public.creative_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "creative_requests_update_creator_or_assigned_or_manager" ON public.creative_requests
  FOR UPDATE USING (
    auth.uid() = created_by
    OR auth.uid() = assigned_to
    OR public.is_manager()
  );

CREATE POLICY "creative_requests_delete_creator_or_manager" ON public.creative_requests
  FOR DELETE USING (auth.uid() = created_by OR public.is_manager());

-- 5. ENABLE REALTIME for daily_spend
ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_spend;

-- ============================================
-- === MIGRATION v3 ===
-- ============================================

-- Add created_at column to ad_accounts
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.ad_accounts SET created_at = updated_at WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ad_accounts_created_at ON public.ad_accounts(created_at);

-- ============================================
-- === MIGRATION v4 ===
-- ============================================

-- 1. NEW TABLE: OKRs
CREATE TABLE IF NOT EXISTS public.okrs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Objective level
  objective TEXT NOT NULL,
  quarter TEXT NOT NULL DEFAULT 'Q1',
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Key Result level
  key_result TEXT,
  target_value NUMERIC,
  actual_value NUMERIC DEFAULT 0,
  unit TEXT,
  
  -- Metadata
  progress_pct NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'on_track',
  notes TEXT,
  
  -- Timestamps
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. INDEXES for OKRs
CREATE INDEX IF NOT EXISTS idx_okrs_quarter ON public.okrs(quarter, year);
CREATE INDEX IF NOT EXISTS idx_okrs_owner ON public.okrs(owner_id);
CREATE INDEX IF NOT EXISTS idx_okrs_status ON public.okrs(status);

-- 3. AUTO-CALCULATE progress_pct trigger
CREATE OR REPLACE FUNCTION public.calc_okr_progress()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_value IS NOT NULL AND NEW.target_value > 0 AND NEW.actual_value IS NOT NULL THEN
    NEW.progress_pct := LEAST(100, ROUND((NEW.actual_value / NEW.target_value) * 100, 1));
  END IF;
  
  IF NEW.progress_pct >= 100 THEN
    NEW.status := 'completed';
  ELSIF NEW.progress_pct >= 70 THEN
    NEW.status := 'on_track';
  ELSIF NEW.progress_pct >= 40 THEN
    NEW.status := 'at_risk';
  ELSIF NEW.progress_pct < 40 THEN
    NEW.status := 'behind';
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calc_okr_progress_trigger ON public.okrs;
CREATE TRIGGER calc_okr_progress_trigger
  BEFORE INSERT OR UPDATE ON public.okrs
  FOR EACH ROW EXECUTE FUNCTION public.calc_okr_progress();

-- 4. RLS for OKRs
ALTER TABLE public.okrs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "okrs_select_all" ON public.okrs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "okrs_insert_all" ON public.okrs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "okrs_update_owner_or_manager" ON public.okrs
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR public.is_manager()
  );

CREATE POLICY "okrs_delete_manager" ON public.okrs
  FOR DELETE USING (public.is_manager());

-- 5. ENABLE REALTIME for OKRs
ALTER PUBLICATION supabase_realtime ADD TABLE public.okrs;

-- 6. ADD blocker column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS blocker TEXT;

-- ============================================
-- DONE!
-- ============================================