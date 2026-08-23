-- ============================================
-- MIGRATION v97: Kolom baru dari MASTER "Ads Creative" publish spreadsheet
-- Sumber: 1 file publish (20 sheet tab per klien)
-- Kolom sheet master: No. | Status | Tanggal | Objective Campaign | Funnel | Format |
--                     Angle (request) | Content Link | Caption | Prefilled Message (CTWA)
-- Mapping: Status→ad_status, Tanggal→upload_date, Objective→campaign_objective,
--          Funnel→funnel_stage, Format→format_type, Angle→theme,
--          Content Link→result_link, Caption→caption, Prefilled→prefilled_message
-- ============================================

ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS ad_status TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS funnel_stage TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS campaign_objective TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS prefilled_message TEXT;

-- Index bantu filter status/funnel di dashboard
CREATE INDEX IF NOT EXISTS idx_ads_clusters_status
  ON public.ads_content_clusters(ad_status);
CREATE INDEX IF NOT EXISTS idx_ads_clusters_funnel
  ON public.ads_content_clusters(funnel_stage);