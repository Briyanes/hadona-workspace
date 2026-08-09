-- Migration v60 COMPLETE FIX: Self-contained, idempotent (safe to run multiple times)
-- Run file INI di Supabase SQL Editor

-- =====================================================
-- 1. CREATE TABLE (jika belum ada)
-- =====================================================
CREATE TABLE IF NOT EXISTS client_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Communication details
  type TEXT NOT NULL DEFAULT 'call' CHECK (type IN ('call', 'email', 'whatsapp', 'meeting', 'visit', 'other')),
  subject TEXT NOT NULL,
  notes TEXT,
  
  -- Outcome tracking
  outcome TEXT CHECK (outcome IN ('positive', 'neutral', 'negative', 'follow_up', 'closed_won', 'closed_lost')),
  follow_up_date DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. INDEXES (idempotent dengan IF NOT EXISTS)
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_client_communications_client_id ON client_communications(client_id);
CREATE INDEX IF NOT EXISTS idx_client_communications_user_id ON client_communications(user_id);
CREATE INDEX IF NOT EXISTS idx_client_communications_follow_up ON client_communications(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_communications_created_at ON client_communications(created_at DESC);

-- =====================================================
-- 3. ENABLE RLS
-- =====================================================
ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. DROP OLD POLICIES (idempotent dengan IF EXISTS)
-- =====================================================
DROP POLICY IF EXISTS "Users can view client communications" ON client_communications;
DROP POLICY IF EXISTS "Users can insert client communications" ON client_communications;
DROP POLICY IF EXISTS "Users can update own communications" ON client_communications;
DROP POLICY IF EXISTS "Admins can update all communications" ON client_communications;
DROP POLICY IF EXISTS "Users can delete own communications" ON client_communications;
DROP POLICY IF EXISTS "Admins can delete all communications" ON client_communications;

-- =====================================================
-- 5. CREATE FIXED RLS POLICIES
--    (TANPA client_team — pakai clients.account_manager_id)
-- =====================================================
CREATE POLICY "Users can view client communications" ON client_communications
  FOR SELECT USING (
    user_id = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND (role = 'super_admin' OR role = 'project_manager')
    )
    OR EXISTS (
      SELECT 1 FROM clients c 
      WHERE c.id = client_communications.client_id 
      AND c.account_manager_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert client communications" ON client_communications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own communications" ON client_communications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can update all communications" ON client_communications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND (role = 'super_admin' OR role = 'project_manager')
    )
  );

CREATE POLICY "Users can delete own communications" ON client_communications
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can delete all communications" ON client_communications
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() 
      AND (role = 'super_admin' OR role = 'project_manager')
    )
  );

-- =====================================================
-- 6. TRIGGER for updated_at (idempotent dengan OR REPLACE)
-- =====================================================
CREATE OR REPLACE FUNCTION update_client_communications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger dulu jika ada, lalu recreate (idempotent)
DROP TRIGGER IF EXISTS client_communications_updated_at ON client_communications;

CREATE TRIGGER client_communications_updated_at
  BEFORE UPDATE ON client_communications
  FOR EACH ROW
  EXECUTE FUNCTION update_client_communications_updated_at();