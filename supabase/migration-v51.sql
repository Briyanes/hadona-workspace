-- ============================================================================
-- Migration v51: Insert 6 client baru dari weekly report sheet
-- ============================================================================
-- Sisa client yang belum terdaftar di DB (terdeteksi dari hasil sync report):
--   1. Haena Konstruksi (di sheet typo "Haena Kontruksi")
--   2. NOUBAN
--   3. Tombo Ati
--   4. Bolu Kukis
--   5. NOUBAN CPAS
--   6. OCEAN Travel
--
-- CATATAN: "YBD" TIDAK di-insert di sini, karena di DB sudah ada
-- "Your Best Deal". Acronym matching (YBD <-> Your Best Deal) sudah
-- ditambahkan di kode matchClientFuzzy (sheet-parser.ts).
--
-- Run di: Supabase Dashboard > SQL Editor > Paste semua isi > RUN
-- ============================================================================

-- Step 1: Insert 6 client baru (idempotent — cek slug dulu)
INSERT INTO public.clients (name, slug, industry, status, services)
SELECT * FROM (VALUES
  ('Haena Konstruksi', 'haena-konstruksi', 'Konstruksi / Property', 'active'::client_status, ARRAY['Meta Ads']::text[]),
  ('NOUBAN', 'nouban', 'E-commerce / F&B', 'active'::client_status, ARRAY['Meta Ads']::text[]),
  ('Tombo Ati', 'tombo-ati', 'F&B / Kuliner', 'active'::client_status, ARRAY['Meta Ads']::text[]),
  ('Bolu Kukis', 'bolu-kukis', 'F&B / Kuliner', 'active'::client_status, ARRAY['Meta Ads']::text[]),
  ('NOUBAN CPAS', 'nouban-cpas', 'E-commerce / F&B', 'active'::client_status, ARRAY['Meta Ads CPAS']::text[]),
  ('OCEAN Travel', 'ocean-travel', 'Travel / Hospitality', 'active'::client_status, ARRAY['Meta Ads']::text[])
) AS v(name, slug, industry, status, services)
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients c WHERE c.slug = v.slug
);

-- Step 2: Verify hasilnya
SELECT 'clients-new' AS phase, name, slug, status
FROM public.clients
WHERE slug IN (
  'haena-konstruksi', 'nouban', 'tombo-ati', 'bolu-kukis', 'nouban-cpas', 'ocean-travel'
)
ORDER BY name;

-- Step 3 (info only): Cek apakah "Your Best Deal" sudah ada
-- (seharusnya sudah, untuk acronym match YBD)
SELECT 'ybd-check' AS phase,
  CASE WHEN EXISTS (SELECT 1 FROM public.clients WHERE name ILIKE '%your best deal%')
       THEN 'EXISTS - YBD akan auto-match via acronym'
       ELSE 'NOT FOUND - perlu insert manual sebagai "Your Best Deal"'
  END AS status;