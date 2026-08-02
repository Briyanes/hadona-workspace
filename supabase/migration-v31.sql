-- ═══════════════════════════════════════════════════════════
-- MIGRATION v31: budget_alerts table (was missing in production)
-- Fix: Dashboard budget_alerts 404 error
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.budget_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  ad_account_id UUID,
  threshold_pct NUMERIC DEFAULT 0,
  current_spend NUMERIC DEFAULT 0,
  monthly_budget NUMERIC DEFAULT 0,
  alert_type TEXT DEFAULT 'warning' CHECK (alert_type IN ('info', 'warning', 'critical', 'overspend')),
  message TEXT,
  is_acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view
CREATE POLICY "budget_alerts_select_authenticated"
  ON public.budget_alerts
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Only admins can acknowledge
CREATE POLICY "budget_alerts_update_admin"
  ON public.budget_alerts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Enable Realtime
ALTER TABLE public.budget_alerts REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_alerts;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_budget_alerts_acknowledged
  ON public.budget_alerts(is_acknowledged, created_at DESC);