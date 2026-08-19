-- Migration v88: Content Plans - add tema & thumbnail columns + safety net + RLS verification
-- Matches published spreadsheet structure: No, Pillar, Tipe, Tema, Copy, Details, Referensi, Caption, Thumbnail, Progress, Link Hasil, Tanggal Unggah

-- 1. New columns (spreadsheet has Tema & Thumbnail which are not in DB yet)
ALTER TABLE public.content_plans ADD COLUMN IF NOT EXISTS tema TEXT;
ALTER TABLE public.content_plans ADD COLUMN IF NOT EXISTS thumbnail TEXT;

-- 2. Safety net: ensure ALL v81/v82 columns exist (idempotent)
ALTER TABLE public.content_plans
  ADD COLUMN IF NOT EXISTS pilar TEXT,
  ADD COLUMN IF NOT EXISTS konten TEXT,
  ADD COLUMN IF NOT EXISTS copy TEXT,
  ADD COLUMN IF NOT EXISTS details TEXT,
  ADD COLUMN IF NOT EXISTS reference TEXT,
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS link_hasil TEXT,
  ADD COLUMN IF NOT EXISTS tanggal_upload DATE,
  ADD COLUMN IF NOT EXISTS progress TEXT DEFAULT 'proses_edit',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_content_plans_tema ON public.content_plans(tema);
CREATE INDEX IF NOT EXISTS idx_content_plans_thumbnail ON public.content_plans(thumbnail);

-- 4. Normalize inconsistent progress values from legacy rows
--    (sheet labels "Done", "Wrapped", "Proses Edit", "proses_edit" etc -> canonical keys)
UPDATE public.content_plans SET progress = 'done'
WHERE lower(trim(progress)) IN ('done', 'selesai', 'wrapped', 'terpublish', 'published');
UPDATE public.content_plans SET progress = 'proses_edit'
WHERE progress IS NOT NULL AND progress NOT IN ('done', 'proses_edit', 'cancel');

-- 5. RLS policies safety net (drop & recreate if missing, matching existing pattern for authenticated users)
DROP POLICY IF EXISTS content_plans_select ON public.content_plans;
DROP POLICY IF EXISTS content_plans_insert ON public.content_plans;
DROP POLICY IF EXISTS content_plans_update ON public.content_plans;
DROP POLICY IF EXISTS content_plans_delete ON public.content_plans;

CREATE POLICY content_plans_select ON public.content_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY content_plans_insert ON public.content_plans
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY content_plans_update ON public.content_plans
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY content_plans_delete ON public.content_plans
  FOR DELETE TO authenticated USING (true);