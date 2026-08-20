-- Migration v90: Konsolidasi divisi "Content Production" → "Editor"
--
-- Konteks: Divisi Editor dipromosikan menjadi divisi resmi.
-- Nilai lama "Content Production" dihapus dari UI (task-board tabs & dropdown),
-- jadi data lama harus dimigrasikan ke "Editor" agar tidak jadi orphan data.
-- Idempotent: aman dijalankan berulang kali.

-- 1) Migrasi task dengan division = 'Content Production' → 'Editor'
UPDATE tasks
SET division = 'Editor'
WHERE division = 'Content Production';

-- 2) Migrasi profiles.division (text[]) yang mengandung 'Content Production' → 'Editor'
--    Hanya update jika belum mengandung 'Editor' (hindari duplikat elemen array).
UPDATE profiles
SET division = array_replace(division, 'Content Production', 'Editor')
WHERE division @> ARRAY['Content Production']::text[]
  AND NOT division @> ARRAY['Editor']::text[];

-- 3) Untuk profiles yang sudah punya 'Editor' DAN 'Content Production',
--    hapus 'Content Production' saja (buang duplikat).
UPDATE profiles
SET division = array_remove(division, 'Content Production')
WHERE division @> ARRAY['Content Production']::text[]
  AND division @> ARRAY['Editor']::text[];