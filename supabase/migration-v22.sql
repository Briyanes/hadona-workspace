-- ============================================
-- MIGRATION v22: Multi-Divisi untuk Staff
-- Ubah kolom profiles.division dari TEXT → TEXT[]
-- Sehingga satu user bisa punya multiple divisi
-- ============================================

-- 1. Ubah tipe kolom division di profiles dari TEXT ke TEXT[]
-- Existing data otomatis di-convert: 'Advertiser' → ['Advertiser']
-- NULL tetap NULL (belum onboarding)
ALTER TABLE public.profiles 
  ALTER COLUMN division TYPE TEXT[] 
  USING CASE 
    WHEN division IS NULL THEN NULL
    ELSE ARRAY[division]::TEXT[]
  END;

-- 2. Update comment
COMMENT ON COLUMN public.profiles.division IS 'Array of divisions: Creative Director, Content Creator, Production, Project Manager, Advertiser, Account Executive, Copywriter, Developer. NULL = not yet onboarded. Empty array = onboarded but no division.';

-- 3. Update handle_new_user trigger untuk set division ke NULL (onboarding akan handle)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'advertiser',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verify
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'division';