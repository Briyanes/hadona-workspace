-- Migration v110: Fix "duplicate key value violates unique constraint clients_slug_key"
--
-- Gejala (insiden 9 Nov 2026): toast "Gagal menyimpan: duplicate key value
-- violates unique constraint \"clients_slug_key\"" saat membuat client baru
-- dari menu Strategy & OKR (Client Strategy Wizard), halaman Clients, dan
-- modal Invoice (client baru).
--
-- Root cause:
--   1. Frontend menghitung slug = slugify(nama) TANPA cek duplikat
--      (client-strategy-wizard.tsx, clients/page.tsx, invoices/page.tsx).
--   2. Trigger v62 (generate_client_slug) hanya mengisi slug bila NULL/kosong —
--      TIDAK menjamin keunikan. Nama sama/serupa → slug sama → error 23505
--      mentah Postgres sampai ke user.
--
-- Fix (layer DB — safety net untuk SEMUA jalur insert/update):
--   Rewrite generate_client_slug() agar SELALU menghasilkan slug unik:
--   auto-suffix "-2", "-3", dst. saat bentrok, baik pada INSERT maupun
--   UPDATE/rename (exclude diri sendiri → rename tidak pernah error lagi).
--   search_path dipin (pelajaran insiden v108: fn tanpa pin = hazard laten).
--
--   Layer UX (pesan ramah + pre-check) dikerjakan di frontend
--   (src/lib/client-slug.ts) — lihat commit terkait.
--
-- Idempotent: DROP IF EXISTS + CREATE — aman dijalankan berulang.
-- SLUG EXISTING TIDAK DIUBAH (hanya insert/update baru yang diberi suffix).

-- ============================================================
-- 1. Rewrite fungsi trigger: slug selalu unik
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_client_slug()
RETURNS TRIGGER AS $$
DECLARE
  base      TEXT;
  candidate TEXT;
  suffix    INT := 1;
BEGIN
  -- Normalisasi: dari name bila slug kosong; bila slug sudah diisi, pakai apa adanya
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := COALESCE(NEW.name, '');
    base := lower(base);
    base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
    base := regexp_replace(base, '^-+|-+$', '', 'g');
  ELSE
    base := NEW.slug;
  END IF;

  -- Fallback bila nama tanpa alfanumerik (mis. "***") agar NOT NULL tak dilanggar
  IF base IS NULL OR base = '' THEN
    base := 'client';
  END IF;

  -- Cari kandidat unik; exclude diri sendiri (NEW.id) supaya UPDATE/rename aman.
  -- (DEFAULT id di-evaluasi sebelum BEFORE trigger → NEW.id selalu terisi saat INSERT.)
  candidate := base;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.slug = candidate
        AND c.id IS DISTINCT FROM NEW.id
    );
    suffix    := suffix + 1;
    candidate := base || '-' || suffix;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SET search_path = public;  -- pin (pelajaran v108: fn tanpa pin rawan resolusi basi)

-- ============================================================
-- 2. Recreate trigger (OID baru — pola v108g/v109d)
--    Fire saat INSERT, atau UPDATE yang menyentuh name/slug.
-- ============================================================
DROP TRIGGER IF EXISTS trg_clients_slug ON public.clients;
CREATE TRIGGER trg_clients_slug
  BEFORE INSERT OR UPDATE OF name, slug ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_client_slug();

-- ============================================================
-- 3. Laporan kondisi data (read-only, tanpa mengubah slug existing)
-- ============================================================
-- Deteksi slug kembar SECARA KASUS (slug unik = case-sensitive di Postgres,
-- jadi 'RMODA' vs 'rmoda' lolos UNIQUE tapi membingungkan di UI). Hanya lapor:
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT lower(slug) AS s, COUNT(*) AS c
    FROM public.clients
    GROUP BY lower(slug)
    HAVING COUNT(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE NOTICE 'v110 INFO: % grup slug case-insensitive kembar (review manual):', dup_count;
    -- Daftarkan agar mudah diaudit di SQL Editor output
    PERFORM 1;  -- no-op; jalankan query berikut manual bila perlu:
  ELSE
    RAISE NOTICE 'v110 OK: tidak ada slug kembar (case-insensitive).';
  END IF;
END $$;