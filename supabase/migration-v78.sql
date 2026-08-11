-- ============================================
-- Migration v78: content_uploads & caption_bank tables
-- ============================================
-- These tables are needed for the dashboard sheet import feature.
-- Sheet 6 (SMM Upload) → content_uploads
-- Sheet 7 (Bank Caption Ads) → caption_bank

-- ============================================
-- 1. CONTENT UPLOADS TABLE
-- ============================================
DO $$ BEGIN
  CREATE TYPE upload_status AS ENUM ('todo', 'in-progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.content_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  upload_date DATE,
  division TEXT DEFAULT 'Social Media Management',
  brief_no TEXT,
  caption TEXT,
  content_link TEXT,
  status upload_status NOT NULL DEFAULT 'todo',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_uploads ENABLE ROW LEVEL SECURITY;

-- RLS Policies: same pattern as tasks (authenticated users can CRUD)
CREATE POLICY "Users can view content uploads" ON public.content_uploads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert content uploads" ON public.content_uploads
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update content uploads" ON public.content_uploads
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete content uploads" ON public.content_uploads
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 2. CAPTION BANK TABLE
-- ============================================
DO $$ BEGIN
  CREATE TYPE caption_performance AS ENUM ('untested', 'good', 'poor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.caption_bank (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  product TEXT,
  theme TEXT,
  headline TEXT,
  caption TEXT,
  hashtags TEXT,
  performance caption_performance NOT NULL DEFAULT 'untested',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.caption_bank ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view caption bank" ON public.caption_bank
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert caption bank" ON public.caption_bank
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update caption bank" ON public.caption_bank
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete caption bank" ON public.caption_bank
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 3. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_content_uploads_client ON public.content_uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_content_uploads_status ON public.content_uploads(status);
CREATE INDEX IF NOT EXISTS idx_caption_bank_client ON public.caption_bank(client_id);
CREATE INDEX IF NOT EXISTS idx_caption_bank_performance ON public.caption_bank(performance);