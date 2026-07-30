-- ============================================
-- Migration V12: Fix ad_accounts for Meta auto-import
-- Allow client_id to be NULL (for auto-imported accounts)
-- Add currency & timezone columns
-- ============================================

BEGIN;

-- 1. Make client_id nullable (auto-imported ad accounts may not be linked to a client yet)
ALTER TABLE public.ad_accounts ALTER COLUMN client_id DROP NOT NULL;

-- 2. Add currency column (for Meta ad account currency)
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS currency TEXT;

-- 3. Add timezone column (for Meta ad account timezone)
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS timezone TEXT;

-- 4. Add created_at column if not exists
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;