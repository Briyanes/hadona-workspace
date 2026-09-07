-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION v108 — SECURITY HARDENING (Supabase Security Advisor)
-- Tujuan: menutup temuan Tier A + B TANPA mengubah perilaku dashboard.
--
--   A1. Function Search Path Mutable (34 fn) → pin search_path semua fn public
--   A2. Security Definer View (client_financial_summary,
--       contract_billing_summary)                → security_invoker = true
--   A3. user_activity (Exposed Auth Users + Definer, TIDAK dipakai app) → DROP
--   A4. schema_migrations RLS disabled           → enable RLS
--   B1. Public Can Execute SECURITY DEFINER (21 fn) → REVOKE EXECUTE dari anon
--       (RPC yang dipakai app tetap di-grant utk authenticated + service_role)
--
-- SENGAJA TIDAK DISENTUH (desain workspace internal — berisiko merusak
-- dashboard jika diubah tanpa proyek besar):
--   - RLS Policy Always True (~40 tabel) → otorisasi dijaga middleware + UI
--   - Multiple Permissive Policies         → konsolidasi kosmetik, backlog
--   - Extensions in Public (pg_trgm, pg_net)
--   - Public Bucket Allows Listing         → perlu analisis per-bucket
--
-- CATATAN: jalankan setelah backup (scripts/backup-database.sh).
-- ═══════════════════════════════════════════════════════════════════

-- ── A1. Pin search_path semua fungsi di schema public ──────────────
-- 'public, extensions' dipilih (bukan '') agar body fungsi yang memakai
-- nama tabel unqualified (mis. INSERT INTO notifications) tetap resolve.
-- Trigger, RLS-policy helper (is_manager, is_division_member, dst.), dan
-- RPC aplikasi semuanya tetap berjalan normal.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %L', r.fn, 'public, extensions');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'v108: skip % (%)', r.fn, SQLERRM;
    END;
  END LOOP;
END $$;

-- ── A3. View user_activity mengekspos auth.users (Critical) ────────
-- Sudah diverifikasi via grep: tidak ada satu pun kode aplikasi yang
-- membaca view ini. Drop sepenuhnya.
DROP VIEW IF EXISTS public.user_activity;

-- ── A2. View keuankan → jalankan dengan hak pemanggil ──────────────
-- Dengan security_invoker, RLS tabel dasar (clients/contracts/invoices)
-- berlaku sesuai user yang login — sesuai pola akses yang sudah ada.
-- Kedua view dipakai halaman Clients dan punya fallback bila gagal.
ALTER VIEW public.client_financial_summary  SET (security_invoker = true);
ALTER VIEW public.contract_billing_summary  SET (security_invoker = true);

-- ── A4. Tabel internal migration tracker → enable RLS ──────────────
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- ── B1. SECURITY DEFINER tidak boleh dieksekusi anon ───────────────
-- Menutup "Public Can Execute SECURITY DEFINER Function" (21 fn).
--Yang masih perlu akses:
--   get_chat_unread_total()        → authenticated (badge notif chat)
--   generate_monthly_billing(..)   → authenticated (Contracts) + service_role (cron)
--   regenerate_unpaid_billings(..) → authenticated (Contracts)
--   increment_view_count(..)       → service_role (API route reports/public)
-- Trigger (handle_new_user, notify_*, dst.) dieksekusi oleh role internal,
-- tidak butuh grant anon.
-- REVOKE dari PUBLIC wajib (anon & authenticated mewarisi grant default
-- PUBLIC pada functions) — REVOKE dari anon saja TIDAK menutup akses.
-- Setelahnya, kembalikan eksplisit ke authenticated + service_role supaya
-- helper RLS (is_manager, is_division_member, dst.) tetap bisa dieksekusi
-- user login (dipanggil di dalam policy) dan API routes (service key).
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;

-- Pastikan 4 RPC yang dipakai aplikasi tetapexecutable (guard by-name,
-- tanpa menebak signature agar tidak error overload).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_chat_unread_total',
        'generate_monthly_billing',
        'regenerate_unpaid_billings',
        'increment_view_count'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.fn);
  END LOOP;
END $$;

-- exec_sql (helper migration, SECURITY DEFINER) → hanya service_role.
-- Menutup celah arbitrary-SQL via anon/authenticated.
DO $$
DECLARE sig text;
BEGIN
  SELECT p.oid::regprocedure::text INTO sig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'exec_sql';
  IF sig IS NOT NULL THEN
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', sig);
    RAISE NOTICE 'v108: exec_sql dikunci ke service_role (%)', sig;
  ELSE
    RAISE NOTICE 'v108: exec_sql tidak ditemukan — lewati';
  END IF;
END $$;