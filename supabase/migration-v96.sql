-- ============================================
-- MIGRATION v96: Perluas ads_content_clusters untuk import Ads Creative per klien
-- Sumber: 4 spreadsheet klien (TPDOC, SHUMI Japan, Threenine, Hadona)
-- Kolom sheet: No | Pillar | Tipe | Tema | Copy | Details | Referensi | Caption | Thumbnail | Progress | Link Hasil | Tanggal Unggah
-- ============================================

-- Perluas tabel ads_content_clusters dengan kolom dari sheet klien
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS pillar TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS content_copy TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS referensi TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS progress TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS result_link TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS assets TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS upload_date DATE;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS sheet_row INT;
ALTER TABLE public.ads_content_clusters ADD COLUMN IF NOT EXISTS client_hint TEXT;

-- Index untuk dedup import (source_sheet + sheet_row + client_hint)
CREATE INDEX IF NOT EXISTS idx_ads_clusters_source
  ON public.ads_content_clusters(source_sheet, sheet_row, client_hint);