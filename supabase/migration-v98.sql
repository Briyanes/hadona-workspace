-- Migration v98: Client Delete Protection & Audit Trail
-- Konteks insiden: 21 Agu 2026, delete client duplikat Moone ikut cascade-delete
-- content_plan milik Puan (2545c763) tanpa jejak audit. Migration ini:
--   1. Helper RPC: cek dependensi client (dipakai UI handleDelete).
--   2. Trigger: blokir delete client yang masih punya data dependen
--      (bypass admin: SET LOCAL hadona.bypass_client_delete = 'on').
--   3. Trigger AFTER DELETE di content_plans: audit ke activity_logs
--      lengkap dengan restore_payload (seluruh row lama dalam JSON).

BEGIN;

-- ============================================================
-- 1. HELPER: cek dependensi client (dipakai UI sebelum delete)
--    CATATAN FIX: tabel `reports` tidak ada → diganti weekly_reports
--    (schema.sql) + monthly_reports. Pakai plpgsql + to_regclass guard
--    agar aman jika salah satu tabel belum ada di environment lain.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_client_dependencies(p_client_id uuid)
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT 'content_plans'::text, count(*)::bigint FROM content_plans WHERE client_id = p_client_id AND deleted_at IS NULL;
  RETURN QUERY SELECT 'tasks'::text, count(*)::bigint FROM tasks WHERE client_id = p_client_id AND deleted_at IS NULL;
  RETURN QUERY SELECT 'invoices'::text, count(*)::bigint FROM invoices WHERE client_id = p_client_id;
  IF to_regclass('public.weekly_reports') IS NOT NULL THEN
    RETURN QUERY SELECT 'weekly_reports'::text, count(*)::bigint FROM weekly_reports WHERE client_id = p_client_id;
  END IF;
  IF to_regclass('public.monthly_reports') IS NOT NULL THEN
    RETURN QUERY SELECT 'monthly_reports'::text, count(*)::bigint FROM monthly_reports WHERE client_id = p_client_id;
  END IF;
END;
$$;

-- ============================================================
-- 2. TRIGGER: blokir delete client dengan dependensi aktif
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_client_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plans bigint;
  v_tasks bigint;
BEGIN
  -- Bypass eksplisit oleh admin via session GUC
  IF current_setting('hadona.bypass_client_delete', true) = 'on' THEN
    RAISE NOTICE 'bypass_client_delete=on: delete client % diizinkan (admin override)', OLD.id;
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_plans FROM content_plans WHERE client_id = OLD.id AND deleted_at IS NULL;
  SELECT count(*) INTO v_tasks FROM tasks WHERE client_id = OLD.id AND deleted_at IS NULL;

  IF v_plans > 0 OR v_tasks > 0 THEN
    RAISE EXCEPTION 'TIDAK BISA HAPUS CLIENT: masih ada % content plan dan % task aktif. Arsipkan client (is_active=false) alih-alih delete. Force-delete: SET LOCAL hadona.bypass_client_delete = ''on''.', v_plans, v_tasks
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_client_delete ON public.clients;
CREATE TRIGGER trg_protect_client_delete
  BEFORE DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.protect_client_delete();

-- ============================================================
-- 3. AUDIT AFTER DELETE: content_plans (termasuk cascade delete)
--    restore_payload = snapshot utuh row → bisa di-restore kapan pun
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_content_plan_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := NULL;
BEGIN
  -- Ambil aktor jika ada (di-set UI via set_config('hadona.actor_user_id', ...))
  BEGIN
    v_actor := NULLIF(current_setting('hadona.actor_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata)
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

DROP TRIGGER IF EXISTS trg_audit_content_plan_delete ON public.content_plans;
CREATE TRIGGER trg_audit_content_plan_delete
  AFTER DELETE ON public.content_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_content_plan_delete();

-- ============================================================
-- 4. GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_client_dependencies(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.protect_client_delete() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.audit_content_plan_delete() TO authenticated, service_role;

COMMIT;