-- ============================================
-- Migration v80: Sheet sync enhancements
-- ============================================
-- 1. Add source_sheet, result_link, blockers columns to tasks
-- 2. Create creative_revisions table (referenced by code but missing)
-- 3. Add assigned_to, due_date, created_by columns to creative_requests
-- 4. Enable realtime for content_uploads & caption_bank
-- ============================================

-- ─── 1. TASKS: new columns for sheet sync ───
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS source_sheet TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS result_link TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS blockers TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sheet_row_id TEXT;

-- Unique constraint to prevent duplicate imports from same sheet+row
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_sheet_row_unique
    ON public.tasks (source_sheet, sheet_row_id)
    WHERE source_sheet IS NOT NULL AND sheet_row_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 2. CREATIVE REQUESTS: add missing columns ───
ALTER TABLE public.creative_requests ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.creative_requests ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.creative_requests ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 3. CREATIVE REVISIONS table ───
CREATE TABLE IF NOT EXISTS public.creative_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creative_request_id UUID NOT NULL REFERENCES public.creative_requests(id) ON DELETE CASCADE,
  revision_round INTEGER NOT NULL DEFAULT 1,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_revisions_request_id ON public.creative_revisions(creative_request_id);

-- RLS
ALTER TABLE public.creative_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_revisions_select_all" ON public.creative_revisions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_revisions_insert_all" ON public.creative_revisions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "creative_revisions_update_all" ON public.creative_revisions
  FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "creative_revisions_delete_all" ON public.creative_revisions
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at
CREATE TRIGGER update_creative_revisions_updated_at BEFORE UPDATE ON public.creative_revisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 4. REALTIME for sheet-synced tables ───
ALTER PUBLICATION supabase_realtime ADD TABLE public.content_uploads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.caption_bank;
ALTER PUBLICATION supabase_realtime ADD TABLE public.creative_revisions;

-- ─── 5. Add updated_at trigger to content_uploads & caption_bank ───
CREATE TRIGGER update_content_uploads_updated_at BEFORE UPDATE ON public.content_uploads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_caption_bank_updated_at BEFORE UPDATE ON public.caption_bank
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();