-- Migration v36: Create budget_alerts table (fixes 404 error on dashboard)
-- This table is queried by BudgetAlertsBar component but was never created

CREATE TABLE IF NOT EXISTS public.budget_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    ad_account_id TEXT,
    threshold_pct NUMERIC DEFAULT 0,
    current_spend NUMERIC DEFAULT 0,
    monthly_budget NUMERIC DEFAULT 0,
    alert_type TEXT NOT NULL DEFAULT 'warning' CHECK (alert_type IN ('info', 'warning', 'critical', 'overspend')),
    message TEXT,
    is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_budget_alerts_client ON public.budget_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_acknowledged ON public.budget_alerts(is_acknowledged);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_created ON public.budget_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE public.budget_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: All authenticated users can view alerts
CREATE POLICY "budget_alerts_select_authenticated"
    ON public.budget_alerts
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins/PMs can acknowledge alerts
CREATE POLICY "budget_alerts_update_admin"
    ON public.budget_alerts
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'project_manager')
        )
    );

-- Only service role can insert (via cron/sync jobs)
CREATE POLICY "budget_alerts_insert_service"
    ON public.budget_alerts
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_alerts;