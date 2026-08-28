-- Migration v100 — content_plans.sort_order (urutan baris permanen per client/bulan)
-- Latar: UI mengurutkan created_at DESC, sehingga urutan baris rapuh (edit/touch
-- created_at bisa mengacak urutan). Solusi definitif: kolom sort_order eksplisit.
--
-- Jalankan manual di Supabase SQL Editor (jalur DDL programatik terblokir,
-- lihat DEPLOY-V99.md). Script idempotent — aman dijalankan berulang.
--
-- Desain: kolom NULLABLE (bukan NOT NULL DEFAULT 0) supaya trigger bisa
-- membedakan "insert tanpa sort_order" (NULL → auto-assign max+1) dari
-- "insert eksplisit sort_order = 0" (baris pertama import → dipertahankan).
--
-- Backfill memetakan urutan yang SUDAH benar saat ini (created_at DESC hasil
-- commit 5e85cda) ke sort_order 0..n-1, sehingga tidak ada perubahan tampilan.

-- 1) Kolom sort_order (nullable — lihat catatan desain di atas)
ALTER TABLE public.content_plans
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- 2) Backfill: baris paling baru (created_at terbesar) = sort_order 0, dst.
--    (mirror dari urutan tampilan UI saat ini)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY client_id, month
           ORDER BY created_at DESC
         ) - 1 AS rn
  FROM public.content_plans
)
UPDATE public.content_plans cp
SET sort_order = r.rn
FROM ranked r
WHERE r.id = cp.id
  AND cp.sort_order IS NULL;

-- 3) Index untuk query per client+bulan
CREATE INDEX IF NOT EXISTS idx_content_plans_client_month_sort
  ON public.content_plans (client_id, month, sort_order);

-- 4) Trigger: INSERT tanpa sort_order eksplisit (NULL) → diletakkan di paling
--    bawah (max+1 per client+bulan). SECURITY DEFINER agar tidak terhalang RLS
--    pemanggil (pola sama dengan trigger internal Supabase).
CREATE OR REPLACE FUNCTION public.content_plans_assign_sort_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_so integer;
BEGIN
  IF NEW.sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_so
    FROM public.content_plans
    WHERE client_id = NEW.client_id AND month = NEW.month;
    NEW.sort_order := next_so;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_plans_sort_order ON public.content_plans;
CREATE TRIGGER trg_content_plans_sort_order
  BEFORE INSERT ON public.content_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.content_plans_assign_sort_order();

-- Verifikasi manual setelah run:
--   SELECT client_id, month, count(*), min(sort_order), max(sort_order),
--          count(*) FILTER (WHERE sort_order IS NULL) AS null_rows
--   FROM content_plans GROUP BY 1,2 ORDER BY 1,2;