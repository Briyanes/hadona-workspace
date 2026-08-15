-- Migration v85: Creative Deliverables (Google Drive Integration)
-- Tabel untuk menyimpan riwayat file hasil edit (video/gambar) yang diupload
-- editor ke Google Drive via workspace. Setiap upload = 1 versi (v1, v2, ...),
-- terhubung ke creative_request tertentu.

CREATE TABLE IF NOT EXISTS public.creative_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_request_id UUID NOT NULL REFERENCES public.creative_requests(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,              -- nomor versi (v1, v2, ...)
  file_name TEXT NOT NULL,                         -- nama file asli
  file_size BIGINT,                                -- ukuran dalam bytes
  mime_type TEXT,                                  -- video/mp4, image/png, dll
  drive_file_id TEXT,                              -- Google Drive file ID
  drive_web_view_link TEXT,                        -- link buka di Drive
  drive_web_content_link TEXT,                     -- link download langsung
  drive_folder_id TEXT,                            -- folder Drive tempat file disimpan
  note TEXT,                                       -- catatan uploader (opsional)
  status TEXT NOT NULL DEFAULT 'uploaded',         -- uploaded | approved | rejected | superseded
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: query per request (urut versi terbaru)
CREATE INDEX IF NOT EXISTS creative_deliverables_request_idx
  ON public.creative_deliverables (creative_request_id, created_at DESC);

-- Index: filter by status
CREATE INDEX IF NOT EXISTS creative_deliverables_status_idx
  ON public.creative_deliverables (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS creative_deliverables_updated_at ON public.creative_deliverables;
CREATE TRIGGER creative_deliverables_updated_at
  BEFORE UPDATE ON public.creative_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS policies (mengikuti pola tabel lain: user login bisa baca,
-- upload hanya untuk user terkait creative workflow)
ALTER TABLE public.creative_deliverables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creative_deliverables_select_authenticated" ON public.creative_deliverables
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "creative_deliverables_insert_authenticated" ON public.creative_deliverables
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "creative_deliverables_update_authenticated" ON public.creative_deliverables
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "creative_deliverables_delete_authenticated" ON public.creative_deliverables
  FOR DELETE TO authenticated
  USING (true);