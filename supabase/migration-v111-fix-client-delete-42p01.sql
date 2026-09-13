-- Migration v111: Fix "Gagal hapus: relation \"content_plans\" does not exist"
--
-- Gejala (insiden 13 Sep 2026): hapus client di halaman Clients gagal dengan
-- toast "Gagal hapus: relation \"content_plans\" does not exist" (Postgres 42P01).
-- Reproduce via REST (pre-migration):
--   - RPC get_client_dependencies → 404 42P01 content_plans
--   - DELETE /clients?id=...      → 404 42P01 content_plans
--
-- Root cause: fungsi v98 (get_client_dependencies, protect_client_delete,
-- audit_content_plan_delete) mem-reference tabel UNQUALIFIED. File v98 di repo
-- sudah `SET search_path = public`, tapi fn di produksi TIDAK PERNAH di
-- DROP+CREATE sejak 21 Agu 2026 → resolusi relasi ter-cache basi pasca
-- perubahan environment v108/v110. Pola identik insiden v109d/v109e.
-- (v108c tidak menyentuh fn ini — v98 dibuat SETELAH v108.)
--
-- Fix (pola terbukti v109d/e):
--   1. DROP trigger lama → DROP fn (OID lama mati, plan cache basi ikut mati)
--   2. CREATE fn ulang: search_path DIPIN + SEMUA tabel schema-qualified
--      `public.` + guard to_regclass fail-loud/fail-closed
--   3. CREATE trigger ulang (mereferensi fn OID baru)
--   4. Re-apply grants (stance v108: authenticated + service_role, TANPA anon)
--   5. NOTIFY pgrst reload schema (pelajaran v108g)
--
-- Perilaku dipertahankan persis v98:
--   - Proteksi delete client dengan content_plans/tasks aktif
--   - Bypass admin via SET LOCAL hadona.bypass_client_delete = 'on'
--   - Audit trail content_plans + restore_payload
--
-- Idempotent: aman dijalankan berulang.

BEGIN;

-- ============================================================
-- 1. Drop trigger & fungsi lama (OID baru = plan cache basi mati)
-- ============================================================
DROP TRIGGER IF EXISTS trg_protect_client_delete ON public.clients;
DROP TRIGGER IF EXISTS trg_audit_content_plan_delete ON public.content_plans;

DROP FUNCTION IF EXISTS public.get_client_dependencies(uuid);
DROP FUNCTION IF EXISTS public.protect_client_delete();
DROP FUNCTION IF EXISTS public.audit_content_plan_delete();

-- ============================================================
-- 2. Helper RPC: cek dependensi client (dipakai UI + debugging)
--    Semua tabel schema-qualified; tabel wajib = fail-loud;
--    tabel opsional tetap pakai to_regclass guard (pola v98).
-- ============================================================
CREATE FUNCTION public.get_client_dependencies(p_client_id uuid)
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Fail-loud: tabel inti wajib ada. Kalau sampai sini NULL, masalahnya
  -- struktur DB (bukan resolusi basi) → harus terlihat jelas, bukan 42P01 samar.
  IF to_regclass('public.content_plans') IS NULL
     OR to_regclass('public.tasks') IS NULL
     OR to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'get_client_dependencies: tabel inti (content_plans/tasks/invoices) tidak ditemukan di skema public — cek struktur DB'
      USING ERRCODE = '42P01';
  END IF;

  RETURN QUERY SELECT 'content_plans'::text, count(*)::bigint FROM public.content_plans WHERE client_id = p_client_id AND deleted_at IS NULL;
  RETURN QUERY SELECT 'tasks'::text, count(*)::bigint FROM public.tasks WHERE client_id = p_client_id AND deleted_at IS NULL;
  RETURN QUERY SELECT 'invoices'::text, count(*)::bigint FROM public.invoices WHERE client_id = p_client_id;
  IF to_regclass('public.weekly_reports') IS NOT NULL THEN
    RETURN QUERY SELECT 'weekly_reports'::text, count(*)::bigint FROM public.weekly_reports WHERE client_id = p_client_id;
  END IF;
  IF to_regclass('public.monthly_reports') IS NOT NULL THEN
    RETURN QUERY SELECT 'monthly_reports'::text, count(*)::bigint FROM public.monthly_reports WHERE client_id = p_client_id;
  END IF;
END;
$$;

-- ============================================================
-- 3. Trigger: blokir delete client dengan dependensi aktif
--    Fail-closed: kalau tabel proteksi tak ter-resolve → BLOKIR delete,
--    jangan pernah biarkan delete lolos diam-diam saat proteksi error.
-- ============================================================
CREATE FUNCTION public.protect_client_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plans bigint;
  v_tasks bigint;
BEGIN
  -- Bypass eksplisit oleh admin via session GUC (perilaku v98 dipertahankan)
  IF current_setting('hadona.bypass_client_delete', true) = 'on' THEN
    RAISE NOTICE 'bypass_client_delete=on: delete client % diizinkan (admin override)', OLD.id;
    RETURN OLD;
  END IF;

  -- Fail-closed guard (beda v98: schema-qualified + blokir, bukan 42P01 mentah)
  IF to_regclass('public.content_plans') IS NULL OR to_regclass('public.tasks') IS NULL THEN
    RAISE EXCEPTION 'Proteksi delete client tidak bisa memeriksa dependensi (tabel content_plans/tasks tidak ter-resolve). Delete DIBLOKIR demi keamanan data. Perbaiki struktur DB lalu coba lagi.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_plans FROM public.content_plans WHERE client_id = OLD.id AND deleted_at IS NULL;
  SELECT count(*) INTO v_tasks FROM public.tasks WHERE client_id = OLD.id AND deleted_at IS NULL;

  IF v_plans > 0 OR v_tasks > 0 THEN
    RAISE EXCEPTION 'TIDAK BISA HAPUS CLIENT: masih ada % content plan dan % task aktif. Arsipkan client (is_active=false) alih-alih delete. Force-delete: SET LOCAL hadona.bypass_client_delete = ''on''.', v_plans, v_tasks
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_protect_client_delete
  BEFORE DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.protect_client_delete();

-- ============================================================
-- 4. Audit AFTER DELETE: content_plans (termasuk cascade delete)
--    restore_payload = snapshot utuh row → bisa di-restore kapan pun
--    (perilaku v98 dipertahankan, tabel di-schema-qualify)
-- ============================================================
CREATE FUNCTION public.audit_content_plan_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := NULL;
BEGIN
  BEGIN
    v_actor := NULLIF(current_setting('hadona.actor_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    v_actor,
    'content_plan.deleted',
    'content_plan',
    OLD.id,
    format('Content plan "%s" dihapus (client: %s, month: %s)',
      COALESCE(OLD.tema, OLD.konten, 'tanpa tema'),
      COALESCE(OLD.client_id::text, 'NULL'),
      COALESCE(OLD.month, '?')),
    jsonb_build_object(
      'client_id', OLD.client_id,
      'month', OLD.month,
      'pilar', OLD.pilar,
      'konten', OLD.konten,
      'tema', OLD.tema,
      'task_id', OLD.task_id,
      'trigger_source', CASE WHEN tg_op = 'DELETE' AND pg_trigger_depth() > 1 THEN 'cascade' ELSE 'direct' END,
      'restore_payload', to_jsonb(OLD)
    )
  );
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_audit_content_plan_delete
  AFTER DELETE ON public.content_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_content_plan_delete();

-- ============================================================
-- 5. Grants (stance v108: authenticated + service_role, tanpa anon)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_client_dependencies(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.protect_client_delete() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_content_plan_delete() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_client_dependencies(uuid) FROM anon;

-- ============================================================
-- 6. Reload schema cache PostgREST (pelajaran v108g)
-- ============================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- 7. Smoke (di luar transaksi — kegagalan smoke tidak me-rollback fix)
-- ============================================================
-- Harus mengembalikan baris dependensi (bukan error 42P01):
-- SELECT * FROM public.get_client_dependencies('00000000-0000-0000-0000-000000000000'::uuid);
--
-- Harus error check_violation dgn pesan proteksi (bukan 42P01):
-- DELETE FROM public.clients WHERE id = <id client yg punya content plan aktif>;