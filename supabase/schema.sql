-- ============================================
-- HADONA WORKSPACE - DATABASE SCHEMA
-- Supabase / PostgreSQL
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. ENUMS
-- ============================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'project_manager', 'creative_director', 'advertiser', 'account_executive', 'designer', 'copywriter', 'developer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE client_status AS ENUM ('active', 'inactive', 'hold', 'onboarding');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'blocked');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ad_platform AS ENUM ('META', 'Google', 'TikTok');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE ad_account_status AS ENUM ('active', 'inactive', 'hold');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('draft', 'submitted', 'reviewed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE creative_request_status AS ENUM ('requested', 'in_progress', 'review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================
-- 2. PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'advertiser',
  division TEXT,
  avatar_url TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 3. CLIENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  industry TEXT,
  status client_status NOT NULL DEFAULT 'active',
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  services TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  result TEXT,
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  division TEXT,
  start_date DATE,
  due_date DATE,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 5. TASK ASSIGNEES (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(task_id, user_id)
);

-- ============================================
-- 6. TASK COMMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 7. AD ACCOUNTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.ad_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform ad_platform NOT NULL,
  ad_account_id TEXT NOT NULL,
  account_name TEXT,
  objective TEXT,
  daily_budget NUMERIC,
  remaining_budget NUMERIC,
  days_left INTEGER,
  status ad_account_status NOT NULL DEFAULT 'inactive',
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 8. WEEKLY REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pic_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  summary TEXT,
  performance_text TEXT,
  conclusion TEXT,
  action TEXT,
  status report_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 9. REPORT METRICS (Structured metrics extracted from weekly report)
-- ============================================
CREATE TABLE IF NOT EXISTS public.report_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  weekly_report_id UUID NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  value NUMERIC,
  previous_value NUMERIC
);

-- ============================================
-- 10. CLIENT STRATEGIES (OKR / Strategy Deck)
-- ============================================
CREATE TABLE IF NOT EXISTS public.client_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  deck_url TEXT,
  plan_url TEXT,
  service_type TEXT,
  period TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 11. STRATEGY OBJECTIVES
-- ============================================
CREATE TABLE IF NOT EXISTS public.strategy_objectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  strategy_id UUID NOT NULL REFERENCES public.client_strategies(id) ON DELETE CASCADE,
  objective_text TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- 12. STRATEGY KEY RESULTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.strategy_key_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.strategy_objectives(id) ON DELETE CASCADE,
  key_result_text TEXT NOT NULL,
  target_value TEXT,
  current_value TEXT,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- 13. CREATIVE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.creative_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  request_date DATE NOT NULL DEFAULT CURRENT_DATE,
  objective_campaign TEXT,
  funnel TEXT,
  format TEXT,
  angle TEXT,
  content_url TEXT,
  caption TEXT,
  prefilled_message TEXT,
  status creative_request_status NOT NULL DEFAULT 'requested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 14. CONTENT PLANS (Monthly SMM plans)
-- ============================================
CREATE TABLE IF NOT EXISTS public.content_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  plan_url TEXT,
  services TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON public.tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON public.task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_client_id ON public.ad_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_status ON public.ad_accounts(status);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_client_id ON public.weekly_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_report_metrics_report_id ON public.report_metrics(weekly_report_id);
CREATE INDEX IF NOT EXISTS idx_creative_requests_client_id ON public.creative_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_content_plans_client_id ON public.content_plans(client_id);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ad_accounts_updated_at ON public.ad_accounts;
CREATE TRIGGER update_ad_accounts_updated_at BEFORE UPDATE ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- AUTO-GENERATE PROFILE ON SIGNUP
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'role', 'advertiser')::user_role
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log error tapi JANGAN block user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_plans ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is super_admin or project_manager
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'project_manager')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- PROFILES: everyone can read own profile, managers can read all
-- INSERT allow semua karena trigger handle_new_user insert saat signup (auth.uid() belum ada)
CREATE POLICY "profiles_select_own_or_manager" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_manager());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_manager());
CREATE POLICY "profiles_insert_all" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- CLIENTS: all authenticated staff can read, managers can write
CREATE POLICY "clients_select_all" ON public.clients
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "clients_write_manager" ON public.clients
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- TASKS: all authenticated staff can read, all can create, assignee/creator/manager can update
CREATE POLICY "tasks_select_all" ON public.tasks
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tasks_insert_all" ON public.tasks
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "tasks_update_assignee_or_manager" ON public.tasks
  FOR UPDATE USING (
    auth.uid() = created_by
    OR public.is_manager()
    OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
  );
CREATE POLICY "tasks_delete_creator_or_manager" ON public.tasks
  FOR DELETE USING (auth.uid() = created_by OR public.is_manager());

-- TASK ASSIGNEES
CREATE POLICY "task_assignees_select_all" ON public.task_assignees
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "task_assignees_insert_all" ON public.task_assignees
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "task_assignees_delete_all" ON public.task_assignees
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- TASK COMMENTS: all can read, all can write own
CREATE POLICY "task_comments_select_all" ON public.task_comments
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "task_comments_insert_all" ON public.task_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "task_comments_update_own" ON public.task_comments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "task_comments_delete_own_or_manager" ON public.task_comments
  FOR DELETE USING (auth.uid() = user_id OR public.is_manager());

-- AD ACCOUNTS: all authenticated staff can read, managers can write
CREATE POLICY "ad_accounts_select_all" ON public.ad_accounts
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "ad_accounts_write_manager" ON public.ad_accounts
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- WEEKLY REPORTS: all can read, all can create/update own, managers can manage all
CREATE POLICY "weekly_reports_select_all" ON public.weekly_reports
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "weekly_reports_insert_all" ON public.weekly_reports
  FOR INSERT WITH CHECK (auth.uid() = pic_id);
CREATE POLICY "weekly_reports_update_own_or_manager" ON public.weekly_reports
  FOR UPDATE USING (auth.uid() = pic_id OR public.is_manager());
CREATE POLICY "weekly_reports_delete_own_or_manager" ON public.weekly_reports
  FOR DELETE USING (auth.uid() = pic_id OR public.is_manager());

-- REPORT METRICS: follow weekly report access
CREATE POLICY "report_metrics_select_all" ON public.report_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "report_metrics_write_manager" ON public.report_metrics
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- CLIENT STRATEGIES: all can read, managers can write
CREATE POLICY "client_strategies_select_all" ON public.client_strategies
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "client_strategies_write_manager" ON public.client_strategies
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

CREATE POLICY "strategy_objectives_select_all" ON public.strategy_objectives
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "strategy_objectives_write_manager" ON public.strategy_objectives
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

CREATE POLICY "strategy_key_results_select_all" ON public.strategy_key_results
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "strategy_key_results_write_manager" ON public.strategy_key_results
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- CREATIVE REQUESTS: all can read, all can create, creator/manager can update
CREATE POLICY "creative_requests_select_all" ON public.creative_requests
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_requests_insert_all" ON public.creative_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "creative_requests_update_all_or_manager" ON public.creative_requests
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_requests_delete_manager" ON public.creative_requests
  FOR DELETE USING (public.is_manager());

-- CONTENT PLANS: all can read, managers can write
CREATE POLICY "content_plans_select_all" ON public.content_plans
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "content_plans_write_manager" ON public.content_plans
  FOR ALL USING (public.is_manager()) WITH CHECK (public.is_manager());

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_requests;