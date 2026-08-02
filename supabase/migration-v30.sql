-- ============================================
-- MIGRATION V30 — Activity Logs System
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON public.activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- All authenticated staff can read activity logs
CREATE POLICY "activity_logs_select_all" ON public.activity_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- All authenticated staff can insert (via API)
CREATE POLICY "activity_logs_insert_all" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only own logs can be deleted (or admin)
CREATE POLICY "activity_logs_delete_own_or_manager" ON public.activity_logs
  FOR DELETE USING (
    auth.uid() = user_id OR public.is_manager()
  );

-- 5. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;

-- Verify
SELECT 'activity_logs table created successfully' as status;