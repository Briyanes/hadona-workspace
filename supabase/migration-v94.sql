-- ============================================
-- MIGRATION v94: Ads Content Studio (rework)
-- Tabel baru: ads_captions + ads_content_clusters
-- Untuk divisi Copywriter & Advertiser saja
-- ============================================

-- Guard: pastikan fungsi trigger tersedia (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. ads_captions (Banking Caption)
CREATE TABLE IF NOT EXISTS public.ads_captions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  angle TEXT,
  caption TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS untuk ads_captions
ALTER TABLE public.ads_captions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_captions_select_all" ON public.ads_captions;
CREATE POLICY "ads_captions_select_all" ON public.ads_captions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ads_captions_insert_own" ON public.ads_captions;
CREATE POLICY "ads_captions_insert_own" ON public.ads_captions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ads_captions_update_all" ON public.ads_captions;
CREATE POLICY "ads_captions_update_all" ON public.ads_captions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ads_captions_delete_all" ON public.ads_captions;
CREATE POLICY "ads_captions_delete_all" ON public.ads_captions
  FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_ads_captions_client ON public.ads_captions(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_captions_date ON public.ads_captions(entry_date DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ads_captions_updated_at ON public.ads_captions;
CREATE TRIGGER trg_ads_captions_updated_at
  BEFORE UPDATE ON public.ads_captions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================

-- 2. ads_content_clusters (Clustering Content)
CREATE TABLE IF NOT EXISTS public.ads_content_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  format_type TEXT,
  theme TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS untuk ads_content_clusters
ALTER TABLE public.ads_content_clusters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_clusters_select_all" ON public.ads_content_clusters;
CREATE POLICY "ads_clusters_select_all" ON public.ads_content_clusters
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ads_clusters_insert_own" ON public.ads_content_clusters;
CREATE POLICY "ads_clusters_insert_own" ON public.ads_content_clusters
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ads_clusters_update_all" ON public.ads_content_clusters;
CREATE POLICY "ads_clusters_update_all" ON public.ads_content_clusters
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ads_clusters_delete_all" ON public.ads_content_clusters;
CREATE POLICY "ads_clusters_delete_all" ON public.ads_content_clusters
  FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_ads_clusters_client ON public.ads_content_clusters(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_clusters_date ON public.ads_content_clusters(entry_date DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ads_clusters_updated_at ON public.ads_content_clusters;
CREATE TRIGGER trg_ads_clusters_updated_at
  BEFORE UPDATE ON public.ads_content_clusters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();