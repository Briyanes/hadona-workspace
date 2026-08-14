-- Migration v84: Content Ads
-- Menambahkan kolom data Google Sheet "Content Ads" ke tabel content_uploads.
-- Setiap sheet = 1 client. Kolom sheet:
--   No. | Status (Active/Inactive) | Tanggal (text bebas) | Objective Campaign |
--   Funnel | Format | Angle (request) | Content Link | Caption | Prefilled Message (CTWA)
-- Kolom performa tambahan (Testing Date, CTR, dll) disimpan di `extra` JSONB.

ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS ad_no TEXT;
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS ad_status TEXT DEFAULT 'off'; -- 'active' | 'off'
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS tanggal TEXT;                -- kolom "Tanggal" dari sheet (bukan date murni)
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS objective TEXT;              -- CTWA / CTLP / CPAS / Visit Profile
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS funnel TEXT;                 -- TOFU / MOFU / BOFU
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS format_type TEXT;            -- Single Image / Video / Carousel
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS prefilled_message TEXT;
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS client_label TEXT;           -- nama client persis dari nama sheet
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS sheet_name TEXT;
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS sheet_row_no INTEGER;
ALTER TABLE public.content_uploads ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;

-- Dedup idempotent untuk import
CREATE UNIQUE INDEX IF NOT EXISTS content_uploads_sheet_dedup
  ON public.content_uploads (sheet_name, sheet_row_no)
  WHERE sheet_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS content_uploads_objective_idx ON public.content_uploads (objective);
CREATE INDEX IF NOT EXISTS content_uploads_funnel_idx ON public.content_uploads (funnel);
CREATE INDEX IF NOT EXISTS content_uploads_ad_status_idx ON public.content_uploads (ad_status);