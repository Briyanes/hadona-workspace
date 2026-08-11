-- ============================================
-- MIGRATION v77: Content Studio Tables
-- Tabel: content_uploads + caption_bank
-- ============================================

-- 1. content_uploads (SMM Upload Tracker)
CREATE TABLE IF NOT EXISTS content_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  upload_date DATE NOT NULL DEFAULT CURRENT_DATE,
  division TEXT DEFAULT 'SMM',
  brief_no TEXT,
  caption TEXT,
  content_link TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS untuk content_uploads
ALTER TABLE content_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_uploads_select_all" ON content_uploads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "content_uploads_insert_own" ON content_uploads
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "content_uploads_update_all" ON content_uploads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "content_uploads_delete_all" ON content_uploads
  FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_content_uploads_client ON content_uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_content_uploads_status ON content_uploads(status);
CREATE INDEX IF NOT EXISTS idx_content_uploads_date ON content_uploads(upload_date DESC);

-- Trigger updated_at
CREATE TRIGGER trg_content_uploads_updated_at
  BEFORE UPDATE ON content_uploads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================

-- 2. caption_bank (Bank Caption Ads)
CREATE TABLE IF NOT EXISTS caption_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  product TEXT,
  theme TEXT,
  headline TEXT,
  caption TEXT,
  hashtags TEXT,
  performance TEXT DEFAULT 'untested',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS untuk caption_bank
ALTER TABLE caption_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caption_bank_select_all" ON caption_bank
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "caption_bank_insert_own" ON caption_bank
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "caption_bank_update_all" ON caption_bank
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "caption_bank_delete_all" ON caption_bank
  FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_caption_bank_client ON caption_bank(client_id);
CREATE INDEX IF NOT EXISTS idx_caption_bank_performance ON caption_bank(performance);

-- Trigger updated_at
CREATE TRIGGER trg_caption_bank_updated_at
  BEFORE UPDATE ON caption_bank
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();