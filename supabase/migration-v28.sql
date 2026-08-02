-- ============================================
-- MIGRATION v28: Admin Approval Flow
-- Menambah sistem approval untuk user baru yang login via Google OAuth
-- Flow: pending_onboarding → pending_approval → approved/rejected
-- ============================================

-- 1. Tambah kolom approval ke profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Backfill: semua user existing auto-approved
UPDATE public.profiles
SET approval_status = 'approved'
WHERE approval_status IS NULL OR approval_status = '';

-- 3. Update trigger handle_new_user: user baru → pending_onboarding + inactive
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, is_active, approval_status)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'role', 'advertiser')::user_role,
      false,
      'pending_onboarding'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Index untuk query approval queue cepat
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);

-- 5. Enable realtime untuk profiles table (supaya waiting-approval page bisa listen)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ============================================
-- DONE. Setelah run migration ini:
-- - User existing tetap bisa login (approved)
-- - User baru: pending_onboarding → pilih divisi → pending_approval → admin approve → approved
-- ============================================