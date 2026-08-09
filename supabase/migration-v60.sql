-- Migration v60: Client Communication Log
-- Track all interactions with clients (calls, emails, WhatsApp, meetings, etc.)

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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_communications_client_id ON client_communications(client_id);
CREATE INDEX IF NOT EXISTS idx_client_communications_user_id ON client_communications(user_id);
CREATE INDEX IF NOT EXISTS idx_client_communications_follow_up ON client_communications(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_communications_created_at ON client_communications(created_at DESC);

-- RLS Policies
ALTER TABLE client_communications ENABLE ROW LEVEL SECURITY;

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

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_client_communications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_communications_updated_at
  BEFORE UPDATE ON client_communications
  FOR EACH ROW
  EXECUTE FUNCTION update_client_communications_updated_at();