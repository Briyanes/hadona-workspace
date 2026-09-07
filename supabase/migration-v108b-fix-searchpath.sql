-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION v108b — FIX PIN search_path yang TERSKIP di v108
--
-- Latar: block A1 di v108 membungkus tiap ALTER FUNCTION dalam
-- EXCEPTION→NOTICE. Jika SQL Editor (role postgres) bukan owner fungsi
-- (owner: supabase_admin), ALTER ditolak → NOTICE kuning terlewat di
-- balik "Success. No rows returned" → fungsi TetAP rusak (42P01).
--
-- v108b ini:
--   1. Coba SET ROLE supabase_admin (memberi hak owner)
--   2. Pin ULANG semua fungsi — KALI INI GAGAL KERAS (error merah + nama
--      fungsi + alasan), bukan NOTICE bisik-bisih
--   3. Tampilkan tabel status akhir (rows returned) — semua fn harus
--      sudah memuat search_path
--
-- Idempotent — aman dijalankan berulang.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Naik ke role owner (kalau diperbolehkan; kalau tidak → NOTICE, lanjut)
DO $$
BEGIN
  EXECUTE 'SET ROLE supabase_admin';
  RAISE NOTICE 'v108b: SET ROLE supabase_admin OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'v108b: SET ROLE gagal (%) — lanjut sebagai postgres', SQLERRM;
END $$;

-- 2. Pin ulang — GAGAL KERAS agar tidak ada yang terskip diam-diam
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
      RAISE EXCEPTION 'v108b: GAGAL pin % — % (owner fn ini perlu dicek)', r.fn, SQLERRM;
    END;
  END LOOP;
END $$;

RESET ROLE;

-- 3. Status akhir — HARUS 0 rows (semua fungsi sudah ter-pin)
--    Kalau masih ada rows = masih ada fungsi bermasalah: paste hasil ke tim dev.
SELECT p.oid::regprocedure AS fn_belum_terpin,
       pg_get_userbyid(p.proowner) AS owner,
       coalesce(array_to_string(p.proconfig, ', '), '(kosong)') AS proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c
      WHERE c ILIKE 'search_path=%'
    )
  );