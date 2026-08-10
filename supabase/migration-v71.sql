-- Migration v71: Two-Factor Authentication (TOTP) Support
-- Adds 2FA columns for admin & finance roles

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMPTZ;

-- Index for quick lookup of 2FA status
CREATE INDEX IF NOT EXISTS idx_profiles_two_factor ON profiles(two_factor_enabled) WHERE two_factor_enabled = TRUE;

COMMENT ON COLUMN profiles.two_factor_secret IS 'Encrypted TOTP secret (base32)';
COMMENT ON COLUMN profiles.two_factor_backup_codes IS 'Hashed backup codes array';