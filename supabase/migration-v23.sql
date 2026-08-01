-- ============================================
-- MIGRATION v23: Profile Enhancement + User Management
-- Adds: bio, social links, notification prefs, preferences, updated_at
-- ============================================

-- 1. Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"email_task": true, "email_report": true, "email_weekly": false, "telegram_enabled": false, "telegram_webhook": null}'::jsonb,
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{"theme": "light", "language": "id", "timezone": "Asia/Jakarta"}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Auto-update updated_at on profile changes
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 3. Update RLS policies — allow users to update their own profile
-- (Select existing policy first to avoid duplicates)
DO $$
BEGIN
  -- Users can read all profiles (for team directory)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_read_all'
  ) THEN
    CREATE POLICY profiles_read_all ON public.profiles
      FOR SELECT USING (true);
  END IF;

  -- Users can update their own profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_update_self'
  ) THEN
    CREATE POLICY profiles_update_self ON public.profiles
      FOR UPDATE USING (auth.uid() = id);
  END IF;

  -- Super admins and project managers can update any profile
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'profiles_update_managers'
  ) THEN
    CREATE POLICY profiles_update_managers ON public.profiles
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'project_manager')
        )
      );
  END IF;
END
$$;

-- 4. Add last_sign_in tracking (optional, read from auth.users)
-- Note: auth.users already tracks last_sign_in_at, we just expose it via view
CREATE OR REPLACE VIEW public.user_activity AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.is_active,
  p.role,
  p.division,
  p.created_at,
  u.last_sign_in_at,
  u.raw_app_meta_data->>'provider' as auth_provider
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id;

-- Grant access to the view
GRANT SELECT ON public.user_activity TO authenticated;