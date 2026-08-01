-- ============================================
-- MIGRATION v27: Recurring Tasks + Activity Log
-- ============================================

-- ════════════════════════════════════════════
-- 1. RECURRING TASKS TABLE
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recurring_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_title TEXT NOT NULL,
  template_description TEXT,
  template_priority task_priority NOT NULL DEFAULT 'medium',
  template_division TEXT,
  template_result TEXT,

  -- Scheduling
  frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
  day_of_week SMALLINT DEFAULT 1 CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Min, 1=Sen...6=Sab
  day_of_month SMALLINT DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  
  -- Due date offset (days after creation)
  due_in_days INTEGER NOT NULL DEFAULT 7,
  
  -- Relations
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  assignee_ids UUID[] NOT NULL DEFAULT '{}',
  
  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_task_id UUID,
  next_run_date DATE NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_tasks ENABLE ROW LEVEL SECURITY;

-- Managers can manage recurring tasks, all staff can read
CREATE POLICY "recurring_tasks_select_all" ON public.recurring_tasks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "recurring_tasks_write_manager" ON public.recurring_tasks
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ════════════════════════════════════════════
-- 2. ACTIVITY LOGS TABLE (Audit Trail)
-- ════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'status_change', 'assign', 'approve'
  entity_type TEXT NOT NULL, -- 'task', 'client', 'report', 'ad_account', 'creative_request'
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read, anyone authenticated can insert
CREATE POLICY "activity_logs_select_all" ON public.activity_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "activity_logs_insert_all" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_next_run ON public.recurring_tasks(next_run_date) WHERE is_active = true;

-- ════════════════════════════════════════════
-- 3. TRIGGERS: Auto-log on task changes
-- ════════════════════════════════════════════

-- Log on task creation
CREATE OR REPLACE FUNCTION public.log_task_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description, client_id, metadata)
  VALUES (
    NEW.created_by,
    'create',
    'task',
    NEW.id,
    'Task "' || NEW.title || '" dibuat',
    NEW.client_id,
    jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'division', NEW.division)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_insert ON public.tasks;
CREATE TRIGGER trigger_log_task_insert
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_insert();

-- Log on task status change
CREATE OR REPLACE FUNCTION public.log_task_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description, client_id, metadata)
    VALUES (
      COALESCE(auth.uid(), NEW.created_by),
      'status_change',
      'task',
      NEW.id,
      'Task "' || NEW.title || '" status: ' || OLD.status || ' → ' || NEW.status,
      NEW.client_id,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_task_status ON public.tasks;
CREATE TRIGGER trigger_log_task_status
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_status_change();

-- ════════════════════════════════════════════
-- 4. REALTIME for activity logs
-- ════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_tasks;

-- ════════════════════════════════════════════
-- 5. Helper: Calculate next run date
-- ════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.calculate_next_run_date(
  p_frequency TEXT,
  p_day_of_week SMALLINT DEFAULT 1,
  p_day_of_month SMALLINT DEFAULT 1,
  p_from_date DATE DEFAULT CURRENT_DATE
)
RETURNS DATE AS $$
DECLARE
  result_date DATE;
  current_dow SMALLINT;
  days_ahead INTEGER;
  target_month DATE;
BEGIN
  result_date := p_from_date;

  IF p_frequency = 'daily' THEN
    result_date := p_from_date + 1;
  ELSIF p_frequency = 'weekly' THEN
    current_dow := EXTRACT(DOW FROM p_from_date)::SMALLINT;
    days_ahead := (p_day_of_week - current_dow + 7) % 7;
    IF days_ahead = 0 THEN
      days_ahead := 7;
    END IF;
    result_date := p_from_date + days_ahead;
  ELSIF p_frequency = 'monthly' THEN
    target_month := DATE_TRUNC('month', p_from_date + INTERVAL '1 month')::DATE;
    -- Handle months with fewer days (e.g., day 31 in Feb)
    BEGIN
      result_date := MAKE_DATE(
        EXTRACT(YEAR FROM target_month)::INT,
        EXTRACT(MONTH FROM target_month)::INT,
        LEAST(p_day_of_month, 28)
      );
    EXCEPTION WHEN OTHERS THEN
      result_date := target_month;
    END;
  ELSIF p_frequency = 'quarterly' THEN
    target_month := DATE_TRUNC('month', p_from_date + INTERVAL '3 months')::DATE;
    result_date := MAKE_DATE(
      EXTRACT(YEAR FROM target_month)::INT,
      EXTRACT(MONTH FROM target_month)::INT,
      LEAST(p_day_of_month, 28)
    );
  END IF;

  RETURN result_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;