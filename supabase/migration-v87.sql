-- ============================================================
-- MIGRATION v87: Client Strategy Canvas (OKR 2.0)
-- - okrs: client_id, baseline, confidence, kr_type, metric_name
-- - client_social_accounts (aset digital client)
-- - client_competitors (benchmark kompetitor)
-- - client_principles (4M: Mindset/ManPower/Tools/Budget)
-- - client_initiatives (strategy SM/ADS, link ke OKR)
-- ============================================================

-- 1. OKRs upgrade (OKR 2.0)
ALTER TABLE public.okrs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS baseline_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence INTEGER DEFAULT 70,
  ADD COLUMN IF NOT EXISTS kr_type TEXT DEFAULT 'lagging'
    CHECK (kr_type IN ('leading','lagging')),
  ADD COLUMN IF NOT EXISTS metric_name TEXT,
  ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_okrs_client ON public.okrs(client_id);

-- 2. Client social accounts (aset digital)
CREATE TABLE IF NOT EXISTS public.client_social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- instagram, tiktok, facebook, youtube, whatsapp, x
  handle TEXT,
  url TEXT,
  followers INTEGER DEFAULT 0,
  ads_connected BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, platform)
);

-- 3. Client competitors (benchmark)
CREATE TABLE IF NOT EXISTS public.client_competitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT,
  handle TEXT,
  followers INTEGER DEFAULT 0,
  engagement_rate NUMERIC, -- percent, e.g. 3.8
  posting_freq TEXT, -- e.g. '4x/minggu'
  positioning TEXT, -- kekuatan
  weakness TEXT, -- content gap
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Client principles (4M)
CREATE TABLE IF NOT EXISTS public.client_principles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('mindset','manpower','tools','budget')),
  description TEXT NOT NULL,
  pic_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Client initiatives (strategy & KPI → initiatives)
CREATE TABLE IF NOT EXISTS public.client_initiatives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  okr_id UUID REFERENCES public.okrs(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  tag TEXT DEFAULT 'ADS' CHECK (tag IN ('SM','ADS')),
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','active','done','dropped')),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_csa_client ON public.client_social_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_cc_client ON public.client_competitors(client_id);
CREATE INDEX IF NOT EXISTS idx_cp_client ON public.client_principles(client_id);
CREATE INDEX IF NOT EXISTS idx_ci_client ON public.client_initiatives(client_id);

-- RLS
ALTER TABLE public.client_social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_principles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_initiatives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "csa_select" ON public.client_social_accounts;
CREATE POLICY "csa_select" ON public.client_social_accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "csa_write" ON public.client_social_accounts;
CREATE POLICY "csa_write" ON public.client_social_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "cc_select" ON public.client_competitors;
CREATE POLICY "cc_select" ON public.client_competitors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cc_write" ON public.client_competitors;
CREATE POLICY "cc_write" ON public.client_competitors FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "cp_select" ON public.client_principles;
CREATE POLICY "cp_select" ON public.client_principles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cp_write" ON public.client_principles;
CREATE POLICY "cp_write" ON public.client_principles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ci_select" ON public.client_initiatives;
CREATE POLICY "ci_select" ON public.client_initiatives FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ci_write" ON public.client_initiatives;
CREATE POLICY "ci_write" ON public.client_initiatives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- clients.notes dipakai untuk deskripsi brand; tambah kolom lokasi jika belum ada
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS location TEXT;