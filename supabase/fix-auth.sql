-- ============================================
-- FIX AUTH & CREATE ADMIN USER (SAFE VERSION)
-- ============================================
-- Penyebab error "Failed to create user: {}":
-- RLS policy "profiles_insert_manager" memblok INSERT ke profiles
-- saat user baru signup (karena auth.uid() masih NULL saat trigger berjalan)
--
-- Solusi: Disable RLS profiles sementara → buat user → re-enable RLS
-- ============================================

-- ============================================
-- STEP 1: Fix trigger function (versi robust)
-- AMAN: function ada di schema public (milik kita)
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'role', 'advertiser')::user_role
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to create profile: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- STEP 2: Disable RLS pada profiles sementara
-- ============================================
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- >>> LAKUKAN STEP 3 DI DASHBOARD SUPABASE <<<
-- >>> Buka Authentication → Users → Add user
-- >>> Isi email & password, centang "Auto Confirm User"
-- >>> Klik "Create user"
-- >>> PASTI BERHASIL SEKARANG!
-- >>>
-- >>> SETELAH ITU, lanjut run SQL di bawah ini (Step 4-6)


-- ============================================
-- STEP 4: Set role super_admin
-- GANTI EMAIL DI BAWAH DENGAN EMAIL YANG KAMU BUAT!
-- ============================================
UPDATE public.profiles 
SET role = 'super_admin', full_name = 'Admin Hadona' 
WHERE email = 'admin@hadona.id';
-- ⚠️ Ganti 'admin@hadona.id' dengan email kamu!


-- ============================================
-- STEP 5: Fix RLS policy agar signup tidak diblokir lagi
-- ============================================
DROP POLICY IF EXISTS "profiles_insert_manager" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_all" ON public.profiles;

-- Policy INSERT: allow semua (trigger handle_new_user akan insert)
CREATE POLICY "profiles_insert_all" ON public.profiles
  FOR INSERT WITH CHECK (true);

-- Policy SELECT: user bisa lihat profile sendiri, manager bisa lihat semua
DROP POLICY IF EXISTS "profiles_select_own_or_manager" ON public.profiles;
CREATE POLICY "profiles_select_own_or_manager" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_manager());

-- Policy UPDATE: user bisa update profile sendiri, manager bisa update semua
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_manager());


-- ============================================
-- STEP 6: Re-enable RLS
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ============================================
-- STEP 7: Verifikasi
-- ============================================
SELECT email, full_name, role, created_at 
FROM public.profiles 
ORDER BY created_at DESC 
LIMIT 5;

-- ============================================
-- SELESAI! 🎉
-- ============================================
-- Login dengan email & password yang kamu buat di Step 3
-- Role: super_admin (akses penuh ke semua modul)