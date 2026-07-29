-- ============================================
-- HADONA WORKSPACE - MIGRATION v4
-- New: OKR (Objectives & Key Results) table
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. NEW TABLE: OKRs
-- ============================================
CREATE TABLE IF NOT EXISTS public.okrs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Objective level
  objective TEXT NOT NULL,
  quarter TEXT NOT NULL DEFAULT 'Q1',
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Key Result level (each OKR can have multiple KRs)
  key_result TEXT,
  target_value NUMERIC,
  actual_value NUMERIC DEFAULT 0,
  unit TEXT, -- e.g., '%', 'IDR', 'count', 'ROAS'
  
  -- Metadata
  progress_pct NUMERIC DEFAULT 0, -- auto-calculated or manual
  status TEXT DEFAULT 'on_track', -- on_track, at_risk, behind, completed
  notes TEXT,
  
  -- Timestamps
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. INDEXES for OKRs
-- ============================================
CREATE INDEX IF NOT EXISTS idx_okrs_quarter ON public.okrs(quarter, year);
CREATE INDEX IF NOT EXISTS idx_okrs_owner ON public.okrs(owner_id);
CREATE INDEX IF NOT EXISTS idx_okrs_status ON public.okrs(status);

-- ============================================
-- 3. AUTO-CALCULATE progress_pct trigger
-- ============================================
CREATE OR REPLACE FUNCTION public.calc_okr_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate progress if target and actual are set
  IF NEW.target_value IS NOT NULL AND NEW.target_value > 0 AND NEW.actual_value IS NOT NULL THEN
    NEW.progress_pct := LEAST(100, ROUND((NEW.actual_value / NEW.target_value) * 100, 1));
  END IF;
  
  -- Auto-update status based on progress
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

-- ============================================
-- 4. RLS for OKRs
-- ============================================
ALTER TABLE public.okrs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read OKRs
CREATE POLICY "okrs_select_all" ON public.okrs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- All authenticated users can create OKRs
CREATE POLICY "okrs_insert_all" ON public.okrs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Owner, creator, or manager can update
CREATE POLICY "okrs_update_owner_or_manager" ON public.okrs
  FOR UPDATE USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR public.is_manager()
  );

-- Only manager can delete
CREATE POLICY "okrs_delete_manager" ON public.okrs
  FOR DELETE USING (public.is_manager());

-- ============================================
-- 5. ENABLE REALTIME for OKRs
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.okrs;

-- ============================================
-- 6. ADD blocker column to tasks (optional)
-- ============================================
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS blocker TEXT;

-- ============================================
-- 7. VERIFICATION
-- ============================================
-- Test: SELECT * FROM public.okrs LIMIT 1;