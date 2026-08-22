-- ============================================
-- MIGRATION v95: Ads Creative Requests (untuk Content Director - OVI)
-- Tabel baru: ads_creative_requests
-- Queue permintaan creative iklan lintas client
-- Mengikuti sheet "Ads Creative Content Request"
-- ============================================

-- Guard: pastikan fungsi trigger tersedia (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ads_creative_requests
CREATE TABLE IF NOT EXISTS public.ads_creative_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | on_progress | review | done | published
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  objective TEXT,                                  -- Awareness | Traffic | Engagement | Leads | Sales | Messages (CTWA)
  funnel TEXT,                                     -- TOF | MOF | BOF
  format_type TEXT,                                -- Single Image | Carousel | Video | Reels | Story
  angle TEXT,                                      -- Angle (request)
  content_link TEXT,                               -- Link aset desain/video (Drive dll)
  hook TEXT,                                       -- Kalimat pembuka (125 karakter pertama)
  caption TEXT,                                    -- Body caption lengkap
  cta TEXT,                                        -- Call-to-action akhir
  prefilled_message TEXT,                          -- Prefilled Message (CTWA / WhatsApp)
  notes TEXT,                                      -- Catatan tambahan
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS untuk ads_creative_requests
ALTER TABLE public.ads_creative_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ads_req_select_all" ON public.ads_creative_requests;
CREATE POLICY "ads_req_select_all" ON public.ads_creative_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ads_req_insert_own" ON public.ads_creative_requests;
CREATE POLICY "ads_req_insert_own" ON public.ads_creative_requests
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ads_req_update_all" ON public.ads_creative_requests;
CREATE POLICY "ads_req_update_all" ON public.ads_creative_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ads_req_delete_all" ON public.ads_creative_requests;
CREATE POLICY "ads_req_delete_all" ON public.ads_creative_requests
  FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_ads_req_client ON public.ads_creative_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_ads_req_status ON public.ads_creative_requests(status);
CREATE INDEX IF NOT EXISTS idx_ads_req_date ON public.ads_creative_requests(request_date DESC);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_ads_req_updated_at ON public.ads_creative_requests;
CREATE TRIGGER trg_ads_req_updated_at
  BEFORE UPDATE ON public.ads_creative_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();