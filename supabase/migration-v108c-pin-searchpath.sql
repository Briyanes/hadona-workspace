-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION v108c — PIN search_path v3: exclude FUNGSI MILIK EXTENSION
--
-- Pelajaran dari v108/v108b:
--   • Schema public berisi juga operator function milik extension
--     (pg_trgm: strict_word_similarity_op dkk) — owner-nya role extension,
--     TIDAK BISA di-ALTER → v108 terskip diam-diam, v108b fail di fn pertama.
--   • Fungsi extension TIDAK perlu dipin (tidak dipanggil app via REST).
--
-- v108c:
--   1. SET ROLE supabase_admin (kalau bisa)
--   2. Pin SEMUA fungsi public KECUALI milik extension (pg_depend deptype 'e')
--   3. Kalau ada gagal → kumpulkan SEMUA kegagalan sekaligus + owner-nya,
--      jangan berhenti di fungsi pertama
--   4. Report akhir: fungsi app yang masih belum ter-pin (harus 0 rows)
--
-- Idempotent — aman dijalankan berulang.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r record;
  n int := 0;
  failures text := '';
BEGIN
  BEGIN
    EXECUTE 'SET ROLE supabase_admin';
    RAISE NOTICE 'v108c: SET ROLE supabase_admin OK';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'v108c: SET ROLE gagal (%) — lanjut tanpa naik role', SQLERRM;
  END;

  FOR r IN
    SELECT p.oid::regprocedure AS fn,
           pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND d.objid IS NULL              -- exclude fungsi milik extension
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = %L', r.fn, 'public, extensions');
    EXCEPTION WHEN OTHERS THEN
      n := n + 1;
      failures := failures || E'\n  • ' || r.fn::text || ' (owner: ' || r.owner || ') — ' || SQLERRM;
    END;
  END LOOP;

  IF n > 0 THEN
    RAISE EXCEPTION 'v108c: % fungsi app GAGAL dipin (butuh tindakan lanjut):%', n, failures;
  END IF;
END $$;

RESET ROLE;

-- Report akhir — HARUS 0 rows (fungsi app semua sudah ter-pin)
SELECT p.oid::regprocedure AS fn_belum_terpin,
       pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND d.objid IS NULL
  AND (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) c
      WHERE c ILIKE 'search_path=%'
    )
  );
