-- ============================================
-- Migration V11: Meta Ads Integration
-- Store OAuth tokens for Meta Marketing API
-- ============================================

BEGIN;

-- ============================================
-- 1. meta_connections table
-- ============================================
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Meta OAuth data
  fb_user_id TEXT NOT NULL,
  fb_user_name TEXT,
  access_token TEXT NOT NULL,          -- Encrypted at app level
  token_expires_at TIMESTAMPTZ,

  -- Ad accounts this token can access (JSON array of {id, name, account_id})
  ad_accounts_cache JSONB DEFAULT '[]'::jsonb,

  -- Sync settings
  auto_sync BOOLEAN NOT NULL DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,               -- success, error, partial
  last_sync_error TEXT,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, fb_user_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_connections_user_id ON public.meta_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_connections_client_id ON public.meta_connections(client_id);
CREATE INDEX IF NOT EXISTS idx_meta_connections_active ON public.meta_connections(is_active, auto_sync);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

-- RLS: Users can see their own connections, managers can see all
CREATE POLICY "meta_connections_select_own_or_manager"
  ON public.meta_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_manager());

CREATE POLICY "meta_connections_insert_own"
  ON public.meta_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "meta_connections_update_own_or_manager"
  ON public.meta_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_manager());

CREATE POLICY "meta_connections_delete_own_or_manager"
  ON public.meta_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_manager());

-- Auto-update trigger
DROP TRIGGER IF EXISTS update_meta_connections_updated_at ON public.meta_connections;
CREATE TRIGGER update_meta_connections_updated_at BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_connections;

COMMIT;

-- ============================================
-- 2. Add meta_sync_enabled column to ad_accounts
-- ============================================
ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS meta_sync_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ad_accounts
  ADD COLUMN IF NOT EXISTS meta_connection_id UUID REFERENCES public.meta_connections(id) ON DELETE SET NULL;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 3. Sync log table (track every sync run for audit)
-- ============================================
CREATE TABLE IF NOT EXISTS public.meta_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_id UUID REFERENCES public.ad_accounts(id) ON DELETE SET NULL,
  sync_date DATE NOT NULL DEFAULT CURRENT_DATE,
  records_pulled INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_sync_logs_connection ON public.meta_sync_logs(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_sync_logs_date ON public.meta_sync_logs(sync_date DESC);

ALTER TABLE public.meta_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_sync_logs_select_all"
  ON public.meta_sync_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "meta_sync_logs_insert_service"
  ON public.meta_sync_logs FOR INSERT TO authenticated WITH CHECK (true);