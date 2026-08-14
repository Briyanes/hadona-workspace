-- Migration v81: Add 9 new columns to content_plans for detailed content production tracking
-- Matches spreadsheet "Content Production" structure

-- Add new columns
ALTER TABLE public.content_plans
  ADD COLUMN IF NOT EXISTS pilar TEXT,
  ADD COLUMN IF NOT EXISTS konten TEXT,
  ADD COLUMN IF NOT EXISTS copy TEXT,
  ADD COLUMN IF NOT EXISTS details TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS link_hasil TEXT,
  ADD COLUMN IF NOT EXISTS tanggal_upload DATE,
  ADD COLUMN IF NOT EXISTS progress TEXT DEFAULT 'proses_edit';

-- Add updated_at column if not exists
ALTER TABLE public.content_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Create index for new columns
CREATE INDEX IF NOT EXISTS idx_content_plans_pilar ON public.content_plans(pilar);
CREATE INDEX IF NOT EXISTS idx_content_plans_progress ON public.content_plans(progress);
CREATE INDEX IF NOT EXISTS idx_content_plans_konten ON public.content_plans(konten);
CREATE INDEX IF NOT EXISTS idx_content_plans_tanggal_upload ON public.content_plans(tanggal_upload);

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS update_content_plans_updated_at ON public.content_plans;

-- Create trigger for updated_at
CREATE TRIGGER update_content_plans_updated_at BEFORE UPDATE ON public.content_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();