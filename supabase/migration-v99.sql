-- ============================================================
-- MIGRATION v99 — Fix: drag-drop task board gagal diam-diam
--
-- ROOT CAUSE (bug Ovi / creative_director):
--   Policy "tasks_update_assignee_or_manager" hanya mengizinkan
--   created_by / is_manager() / assignee. Anggota divisi lain
--   (mis. Creative Director) TIDAK bisa update task divisinya.
--   PostgREST mengembalikan 200 OK dengan 0 rows (bukan error),
--   frontend menampilkan toast sukses palsu, lalu realtime
--   me-reset card ke posisi lama.
--
-- FIX (DB layer):
--   1. Helper is_division_member() — user aktif yang divisinya
--      (TEXT atau TEXT[]) mencakup divisi task boleh update.
--   2. Policy UPDATE tasks diperluas dengan kondisi tersebut.
--
-- FIX (frontend layer, file terpisah):
--   Deteksi 0-row update via .select("id") → toast error jujur.
-- ============================================================

-- 1. Helper: cek apakah user saat ini anggota divisi tertentu.
--    Menangani profiles.division bertipe TEXT maupun TEXT[]
--    (produksi = TEXT[], schema awal = TEXT) dengan menormalisasi
--    representasi array PostgreSQL ({A,B} / {"A B",C}) sebelum split.
CREATE OR REPLACE FUNCTION public.is_division_member(p_division TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_divisions TEXT;
BEGIN
  IF p_division IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT p.division::text
    INTO v_divisions
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_active;

  IF v_divisions IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Normalisasi bentuk array: {"A B",C} → "A B",C
  v_divisions := regexp_replace(v_divisions, '^\{|\}$', '', 'g');

  RETURN EXISTS (
    SELECT 1
    FROM unnest(string_to_array(v_divisions, ',')) AS elem
    WHERE btrim(elem, ' "{}') = p_division
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Keamanan: hanya user ter-autentikasi yang boleh memanggil helper
REVOKE EXECUTE ON FUNCTION public.is_division_member(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_division_member(TEXT) TO authenticated;

-- 2. Perluas policy UPDATE tasks: anggota divisi task boleh update
DROP POLICY IF EXISTS "tasks_update_assignee_or_manager" ON public.tasks;

CREATE POLICY "tasks_update_assignee_or_manager" ON public.tasks
  FOR UPDATE USING (
    auth.uid() = created_by
    OR public.is_manager()
    OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR public.is_division_member(tasks.division)
  ) WITH CHECK (
    auth.uid() = created_by
    OR public.is_manager()
    OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())
    OR public.is_division_member(tasks.division)
  );

-- 3. Cleanup function lama jika pernah ada
DROP FUNCTION IF EXISTS public.is_division_member();