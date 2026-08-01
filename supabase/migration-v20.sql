-- ============================================
-- MIGRATION v20: Division Standardization & Auth Improvements
-- ============================================

-- 1. Update existing profiles: map old divisions to new standardized ones
-- This ensures backward compatibility with existing data
UPDATE profiles SET division = 'Creative Director' WHERE division ILIKE '%creative director%';
UPDATE profiles SET division = 'Content Creator' WHERE division ILIKE '%content%' OR division ILIKE '%creator%';
UPDATE profiles SET division = 'Production' WHERE division ILIKE '%production%';
UPDATE profiles SET division = 'Project Manager' WHERE division ILIKE '%project manager%' OR division ILIKE '%pm%';
UPDATE profiles SET division = 'Advertiser' WHERE division ILIKE '%advertis%' OR division ILIKE '%ads%' OR division ILIKE '%media buy%';
UPDATE profiles SET division = 'Account Executive' WHERE division ILIKE '%account%' OR division ILIKE '%ae%';
UPDATE profiles SET division = 'Copywriter' WHERE division ILIKE '%copy%' OR division ILIKE '%writer%';
UPDATE profiles SET division = 'Developer' WHERE division ILIKE '%develop%' OR division ILIKE '%tech%';

-- 2. Update existing tasks: map old task divisions to new standardized ones
UPDATE tasks SET division = 'Creative Director' WHERE division ILIKE '%creative%';
UPDATE tasks SET division = 'Content Creator' WHERE division ILIKE '%content%' OR division = 'Social Media Management';
UPDATE tasks SET division = 'Production' WHERE division ILIKE '%production%';
UPDATE tasks SET division = 'Project Manager' WHERE division ILIKE '%project manager%' OR division ILIKE '%pm%';
UPDATE tasks SET division = 'Advertiser' WHERE division ILIKE '%advertis%' OR division = 'Advertising';
UPDATE tasks SET division = 'Account Executive' WHERE division ILIKE '%account%';
UPDATE tasks SET division = 'Copywriter' WHERE division ILIKE '%copy%' OR division ILIKE '%writer%';
UPDATE tasks SET division = 'Developer' WHERE division ILIKE '%develop%' OR division ILIKE '%tech%' OR division = 'SEO';
-- Strategy & Operations tasks → set to NULL (will be reassigned by PM)
UPDATE tasks SET division = NULL WHERE division ILIKE '%strategy%' OR division ILIKE '%operations%';

-- 3. Update handle_new_user trigger to NOT set default division (onboarding will handle it)
-- Drop existing trigger and recreate
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    'staff',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Add comment for documentation
COMMENT ON COLUMN public.profiles.division IS 'Standardized divisions: Creative Director, Content Creator, Production, Project Manager, Advertiser, Account Executive, Copywriter, Developer. NULL = not yet onboarded.';

-- 5. Update RLS policy for profiles to allow users to read their own and teammates' profiles
-- (needed for division-scoped assignee picker)
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 6. Update profiles to allow self-update (for onboarding)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);