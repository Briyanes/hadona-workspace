-- ============================================================================
-- Migration v49: Make weekly_reports.pic_id nullable
-- ============================================================================
-- MASALAH:
-- User sync error: "null value in column 'pic_id' of relation 'weekly_reports'
-- violates not-null constraint"
--
-- ROOT CAUSE:
-- Banyak row di Google Sheet tidak punya PIC (kosong), tapi kolom pic_id di DB
-- punya constraint NOT NULL. Akibatnya 93 dari 186 row gagal di-insert.
--
-- SOLUSI:
-- DROP NOT NULL constraint di pic_id. PIC bersifat opsional.
-- ============================================================================

-- ── Step 1: Drop NOT NULL constraint ─────────────────────────────────────
ALTER TABLE weekly_reports
  ALTER COLUMN pic_id DROP NOT NULL;

-- ── Step 2: Update comment untuk dokumentasi ────────────────────────────
COMMENT ON COLUMN weekly_reports.pic_id IS
  'PIC (account manager) untuk report ini. Opsional — bisa NULL kalau sheet tidak punya data PIC.';

-- ── Step 3: Verify constraint sudah di-drop ─────────────────────────────
SELECT
  'verification' AS info,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'weekly_reports'
  AND column_name = 'pic_id';

-- Expected output:
--   info          | is_nullable
--   ---------------+-------------
--   verification   | YES

-- ============================================================================
-- Selesai. Setelah migration ini:
--   ✅ weekly_reports.pic_id bisa NULL
--   ✅ Sync reports tanpa PIC akan berhasil
--   ✅ Reports dengan PIC tetap work (fuzzy match ke profiles)
-- ============================================================================