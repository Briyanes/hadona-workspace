-- ============================================
-- MIGRATION V29 — Fix admin role & approval status
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Set admin@hadona.id sebagai super_admin
UPDATE public.profiles
SET 
  role = 'super_admin',
  is_active = true,
  approval_status = COALESCE(approval_status, 'approved')
WHERE email = 'admin@hadona.id';

-- 2. Set semua user existing yang sudah active → approval_status = 'approved'
-- (supaya legacy users tidak kena gate approval flow)
UPDATE public.profiles
SET approval_status = 'approved'
WHERE approval_status IS NULL
   OR approval_status = '';

-- 3. Safety: pastikan user yang sudah punya role manager/admin juga approved
UPDATE public.profiles
SET approval_status = 'approved'
WHERE role IN ('super_admin', 'project_manager', 'creative_director')
  AND (approval_status IS NULL OR approval_status != 'rejected');

-- 4. Pastikan kolom approval_status ada (jika v28 belum dijalankan)
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_by UUID;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
EXCEPTION WHEN OTHERS THEN null; END $$;

-- Verify
SELECT email, role, is_active, approval_status FROM public.profiles WHERE email = 'admin@hadona.id';