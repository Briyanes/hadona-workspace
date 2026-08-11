-- ==============================================================================
-- Migration v79: Phase 2 — Major Feature Modules
-- ==============================================================================
-- Creates tables for:
--   1. Lead/CRM Pipeline (leads, lead_activities)
--   2. Approval/Review Workflow (approval_requests)
--   3. Production Module (production_schedules, equipment, equipment_bookings)
--   4. Client Health Score (client_health_scores)
--   5. Brand Kit / Asset Library (brand_kits, brand_assets)
-- ==============================================================================

-- ─── Extensions ───
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. LEAD / CRM PIPELINE
-- ==============================================================================

CREATE TYPE lead_stage AS ENUM (
  'new',
  'contacted',
  'qualified',
  'proposal_sent',
  'negotiation',
  'won',
  'lost'
);

CREATE TYPE lead_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  stage lead_stage NOT NULL DEFAULT 'new',
  priority lead_priority NOT NULL DEFAULT 'medium',
  estimated_value NUMERIC(12, 2) DEFAULT 0,
  actual_value NUMERIC(12, 2) DEFAULT 0,
  source TEXT DEFAULT 'manual',
  notes TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  expected_close_date DATE,
  won_at TIMESTAMPTZ,
  lost_reason TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

CREATE TABLE IF NOT EXISTS lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'note',
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_at ON lead_activities(created_at DESC);

-- ==============================================================================
-- 2. APPROVAL / REVIEW WORKFLOW
-- ==============================================================================

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'changes_requested');
CREATE TYPE approval_type AS ENUM ('creative_content', 'copy_caption', 'ad_creative', 'report', 'other');

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  type approval_type NOT NULL DEFAULT 'creative_content',
  status approval_status NOT NULL DEFAULT 'pending',
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  content_url TEXT,
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  due_date TIMESTAMPTZ,
  priority lead_priority DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_submitted_by ON approval_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_approvals_client_id ON approval_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_approvals_created_at ON approval_requests(created_at DESC);

-- ==============================================================================
-- 3. PRODUCTION MODULE
-- ==============================================================================

CREATE TYPE production_status AS ENUM (
  'scheduled',
  'in_progress',
  'shooting',
  'editing',
  'rendering',
  'review',
  'delivered',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS production_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  status production_status NOT NULL DEFAULT 'scheduled',
  shoot_date TIMESTAMPTZ,
  shoot_location TEXT,
  crew JSONB DEFAULT '[]',
  deliverables JSONB DEFAULT '[]',
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_status ON production_schedules(status);
CREATE INDEX IF NOT EXISTS idx_production_shoot_date ON production_schedules(shoot_date);
CREATE INDEX IF NOT EXISTS idx_production_client_id ON production_schedules(client_id);

-- Equipment tracking
CREATE TYPE equipment_category AS ENUM ('camera', 'lens', 'lighting', 'audio', 'tripod', 'gimbal', 'drone', 'other');
CREATE TYPE equipment_status AS ENUM ('available', 'in_use', 'maintenance', 'lost');

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category equipment_category NOT NULL DEFAULT 'camera',
  brand TEXT,
  model TEXT,
  serial_number TEXT UNIQUE,
  status equipment_status NOT NULL DEFAULT 'available',
  purchase_date DATE,
  purchase_price NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);

CREATE TABLE IF NOT EXISTS equipment_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  production_id UUID REFERENCES production_schedules(id) ON DELETE SET NULL,
  booked_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'reserved',
  notes TEXT,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eq_bookings_equipment_id ON equipment_bookings(equipment_id);
CREATE INDEX IF NOT EXISTS idx_eq_bookings_dates ON equipment_bookings(start_date, end_date);

-- ==============================================================================
-- 4. CLIENT HEALTH SCORE
-- ==============================================================================

CREATE TYPE health_status AS ENUM ('excellent', 'good', 'at_risk', 'critical');

CREATE TABLE IF NOT EXISTS client_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 50 CHECK (score >= 0 AND score <= 100),
  status health_status NOT NULL DEFAULT 'good',
  revenue_trend TEXT DEFAULT 'stable',
  communication_freq TEXT DEFAULT 'regular',
  payment_status TEXT DEFAULT 'current',
  satisfaction_score INTEGER CHECK (satisfaction_score >= 1 AND satisfaction_score <= 5),
  churn_risk_level TEXT DEFAULT 'low',
  notes TEXT,
  last_reviewed_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_client_id ON client_health_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_health_status ON client_health_scores(status);

-- ==============================================================================
-- 5. BRAND KIT / ASSET LIBRARY
-- ==============================================================================

CREATE TABLE IF NOT EXISTS brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  primary_color TEXT DEFAULT '#000000',
  secondary_color TEXT DEFAULT '#FFFFFF',
  accent_color TEXT,
  font_primary TEXT,
  font_secondary TEXT,
  brand_voice TEXT,
  guidelines_url TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_kits_client_id ON brand_kits(client_id);

CREATE TYPE brand_asset_type AS ENUM ('logo', 'color_palette', 'font', 'template', 'guideline', 'image', 'video', 'other');

CREATE TABLE IF NOT EXISTS brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_kit_id UUID NOT NULL REFERENCES brand_kits(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type brand_asset_type NOT NULL DEFAULT 'logo',
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size BIGINT,
  mime_type TEXT,
  tags TEXT[] DEFAULT '{}',
  is_public BOOLEAN DEFAULT false,
  uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_assets_kit_id ON brand_assets(brand_kit_id);
CREATE INDEX IF NOT EXISTS idx_brand_assets_type ON brand_assets(type);

-- ==============================================================================
-- TRIGGERS: Auto-update updated_at
-- ==============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_approval_requests_updated_at BEFORE UPDATE ON approval_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_production_schedules_updated_at BEFORE UPDATE ON production_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_health_scores_updated_at BEFORE UPDATE ON client_health_scores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_brand_kits_updated_at BEFORE UPDATE ON brand_kits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_brand_assets_updated_at BEFORE UPDATE ON brand_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- Leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_all_authenticated" ON leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Lead Activities
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_activities_all_authenticated" ON lead_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Approval Requests
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "approvals_all_authenticated" ON approval_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Production Schedules
ALTER TABLE production_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "production_all_authenticated" ON production_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Equipment
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment_all_authenticated" ON equipment FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Equipment Bookings
ALTER TABLE equipment_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eq_bookings_all_authenticated" ON equipment_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Client Health Scores
ALTER TABLE client_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "health_scores_all_authenticated" ON client_health_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Brand Kits
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_kits_all_authenticated" ON brand_kits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Brand Assets
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_assets_all_authenticated" ON brand_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- COMMENTS
-- ==============================================================================
COMMENT ON TABLE leads IS 'CRM lead pipeline for sales tracking';
COMMENT ON TABLE approval_requests IS 'Creative/content approval workflow';
COMMENT ON TABLE production_schedules IS 'Video/photo production scheduling and tracking';
COMMENT ON TABLE equipment IS 'Equipment inventory for production team';
COMMENT ON TABLE client_health_scores IS 'Client health/churn risk scoring';
COMMENT ON TABLE brand_kits IS 'Brand guidelines and asset library per client';