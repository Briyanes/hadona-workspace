-- ============================================
-- Migration V8: Activity Logs & Triggers
-- Auto-track client-related activities (tasks, reports, strategy, ads)
-- ============================================

-- 1. Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL DEFAULT 'client',  -- task, report, strategy, ad_account, client
  entity_id UUID,                                -- ID of related entity
  action TEXT NOT NULL,                          -- created, updated, completed, status_changed, deleted
  description TEXT NOT NULL,                     -- Human-readable description
  metadata JSONB DEFAULT '{}'::jsonb,            -- Extra context (old_status, new_status, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast client lookups
CREATE INDEX IF NOT EXISTS idx_activity_logs_client_id ON public.activity_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can view activity logs
CREATE POLICY "Activity logs are viewable by authenticated users"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: System/Service role can insert (triggers run as owner)
CREATE POLICY "Activity logs insert by service_role"
  ON public.activity_logs FOR INSERT
  TO service_role, anon
  WITH CHECK (true);

-- Also allow authenticated users to insert (for manual logs)
CREATE POLICY "Activity logs insert by authenticated"
  ON public.activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 2. Helper function to log activity
-- ============================================
CREATE OR REPLACE FUNCTION public.log_activity(
  p_client_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT 'client',
  p_entity_id UUID DEFAULT NULL,
  p_action TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.activity_logs (client_id, user_id, entity_type, entity_id, action, description, metadata)
  VALUES (p_client_id, p_user_id, p_entity_type, p_entity_id, p_action, p_description, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Trigger: Task changes → log activity
-- ============================================
CREATE OR REPLACE FUNCTION public.log_task_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT
  IF (TG_OP = 'INSERT') THEN
    IF NEW.client_id IS NOT NULL THEN
      PERFORM public.log_activity(
        NEW.client_id,
        NEW.assignee_id,
        'task',
        NEW.id,
        'created',
        'Tugas "' || NEW.title || '" dibuat',
        jsonb_build_object('status', NEW.status, 'priority', NEW.priority)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- On UPDATE (status changed)
  IF (TG_OP = 'UPDATE') THEN
    IF NEW.client_id IS NOT NULL THEN
      -- Status changed
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM public.log_activity(
          NEW.client_id,
          NEW.assignee_id,
          'task',
          NEW.id,
          'status_changed',
          'Status tugas "' || NEW.title || '" diubah ke "' || NEW.status || '"',
          jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
        );
      END IF;
      -- Task completed specifically
      IF OLD.status != 'done' AND NEW.status = 'done' THEN
        PERFORM public.log_activity(
          NEW.client_id,
          NEW.assignee_id,
          'task',
          NEW.id,
          'completed',
          'Tugas "' || NEW.title || '" selesai',
          jsonb_build_object('completed_at', now())
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- On DELETE
  IF (TG_OP = 'DELETE') THEN
    IF OLD.client_id IS NOT NULL THEN
      PERFORM public.log_activity(
        OLD.client_id,
        NULL,
        'task',
        OLD.id,
        'deleted',
        'Tugas "' || OLD.title || '" dihapus',
        '{}'::jsonb
      );
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_task_activity ON public.tasks;
CREATE TRIGGER trg_task_activity
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_activity();

-- ============================================
-- 4. Trigger: Weekly Report changes → log activity
-- ============================================
CREATE OR REPLACE FUNCTION public.log_report_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.client_id IS NOT NULL THEN
      PERFORM public.log_activity(
        NEW.client_id,
        NEW.created_by,
        'report',
        NEW.id,
        'created',
        'Laporan mingguan dibuat (' || to_char(NEW.period_start, 'DD Mon') || ' - ' || to_char(NEW.period_end, 'DD Mon YYYY') || ')',
        jsonb_build_object('status', NEW.status)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    IF NEW.client_id IS NOT NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.log_activity(
        NEW.client_id,
        NULL,
        'report',
        NEW.id,
        'status_changed',
        'Status laporan diubah ke "' || NEW.status || '"',
        jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_report_activity ON public.weekly_reports;
CREATE TRIGGER trg_report_activity
  AFTER INSERT OR UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.log_report_activity();

-- ============================================
-- 5. Trigger: Strategy changes → log activity
-- ============================================
CREATE OR REPLACE FUNCTION public.log_strategy_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.client_id IS NOT NULL THEN
      PERFORM public.log_activity(
        NEW.client_id,
        NULL,
        'strategy',
        NEW.id,
        'created',
        'Strategi "' || NEW.title || '" dibuat',
        jsonb_build_object('period', NEW.period)
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_strategy_activity ON public.client_strategies;
CREATE TRIGGER trg_strategy_activity
  AFTER INSERT ON public.client_strategies
  FOR EACH ROW EXECUTE FUNCTION public.log_strategy_activity();

-- ============================================
-- 6. Trigger: Ad Account changes → log activity
-- ============================================
CREATE OR REPLACE FUNCTION public.log_ad_account_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF NEW.client_id IS NOT NULL THEN
      PERFORM public.log_activity(
        NEW.client_id,
        NULL,
        'ad_account',
        NEW.id,
        'created',
        'Ad account ' || NEW.platform || ' ditambahkan',
        jsonb_build_object('platform', NEW.platform, 'daily_budget', NEW.daily_budget)
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ad_account_activity ON public.ad_accounts;
CREATE TRIGGER trg_ad_account_activity
  AFTER INSERT ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_ad_account_activity();

-- ============================================
-- 7. Trigger: Client changes → log activity
-- ============================================
CREATE OR REPLACE FUNCTION public.log_client_activity()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    PERFORM public.log_activity(
      NEW.id,
      NULL,
      'client',
      NEW.id,
      'created',
      'Client "' || NEW.name || '" ditambahkan',
      jsonb_build_object('industry', NEW.industry, 'status', NEW.status)
    );
    RETURN NEW;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.log_activity(
        NEW.id,
        NULL,
        'client',
        NEW.id,
        'status_changed',
        'Status client diubah dari "' || COALESCE(OLD.status, '-') || '" ke "' || NEW.status || '"',
        jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
      );
    END IF;
    -- Contract value changed
    IF OLD.contract_value IS DISTINCT FROM NEW.contract_value THEN
      PERFORM public.log_activity(
        NEW.id,
        NULL,
        'client',
        NEW.id,
        'contract_updated',
        'Nilai kontrak diperbarui',
        jsonb_build_object('old_value', OLD.contract_value, 'new_value', NEW.contract_value)
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_client_activity ON public.clients;
CREATE TRIGGER trg_client_activity
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_activity();