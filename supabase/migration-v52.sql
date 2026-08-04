-- ============================================================================
-- Migration v52: Insert "Your Best Deal" (untuk YBD acronym matching)
-- ============================================================================
-- Hasil v51 step 3 menunjukkan "Your Best Deal" BELUM ada di DB.
-- Client "YBD" di sheet harus di-match ke "Your Best Deal" via acronym matching.
--
-- Run di: Supabase Dashboard > SQL Editor > Paste semua isi > RUN
-- ============================================================================

-- Step 1: Insert "Your Best Deal" (idempotent via slug check)
INSERT INTO public.clients (name, slug, industry, status, services)
SELECT 'Your Best Deal', 'your-best-deal', 'Retail / E-commerce', 'active'::client_status, ARRAY['Meta Ads']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM public.clients c WHERE c.slug = 'your-best-deal'
);

-- Step 2: Verify
SELECT 'verify' AS phase, name, slug, status
FROM public.clients
WHERE slug = 'your-best-deal';