-- Migration v45: Add token_status column to meta_connections
-- FIX B2/B3: Track token validity status for clearer UI feedback

-- Add token_status column
ALTER TABLE meta_connections 
ADD COLUMN IF NOT EXISTS token_status text DEFAULT 'unknown';

-- Add last_sync_error column if not exists (for storing error details)
ALTER TABLE meta_connections 
ADD COLUMN IF NOT EXISTS last_sync_error text;

-- Update existing connections to 'valid' if they have a future expiry date
UPDATE meta_connections 
SET token_status = 'valid' 
WHERE token_expires_at IS NOT NULL 
  AND token_expires_at > NOW()
  AND token_status = 'unknown';

-- Update existing connections to 'invalid' if their expiry date has passed
UPDATE meta_connections 
SET token_status = 'invalid' 
WHERE token_expires_at IS NOT NULL 
  AND token_expires_at < NOW()
  AND token_status = 'unknown';

-- Create index for faster status queries
CREATE INDEX IF NOT EXISTS idx_meta_connections_token_status 
ON meta_connections(token_status);

-- Add comment
COMMENT ON COLUMN meta_connections.token_status IS 
'Tracks token validity: valid | expiring_soon | invalid | unknown';