-- ============================================
-- Migration V7: Client Logo URL
-- Adds logo_url for brand logo display
-- ============================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.clients.logo_url IS 'URL logo client (disimpan di R2 bucket client-logos)';