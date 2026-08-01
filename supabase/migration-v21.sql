-- ============================================
-- MIGRATION v21: Fix handle_new_user trigger
-- Bug: 'staff' is NOT a valid user_role enum value
-- Fix: Use 'advertiser' (valid enum) as default role
-- ============================================

-- Drop old trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate function with correct enum value
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'advertiser',  -- FIXED: valid enum value (was 'staff')
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Also check: add 'staff' to enum IF you want to use it
-- Uncomment below if you prefer 'staff' as default role
-- ============================================
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff' BEFORE 'super_admin';