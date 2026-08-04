-- ════════════════════════════════════════════════════════════════════
-- Migration v44: Add revenue column + sync improvements
-- ════════════════════════════════════════════════════════════════════
-- Changes:
-- 1. Add `revenue` column to ad_spend_logs (for Meta Pixel purchase value)
-- 2. Add `sync_range` column to meta_sync_logs (tracks how many days synced)
-- 3. Add `token_refreshed_at` column to meta_connections
-- ════════════════════════════════════════════════════════════════════

-- 1. Add revenue column to ad_spend_logs (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ad_spend_logs' AND column_name = 'revenue'
    ) THEN
        ALTER TABLE ad_spend_logs ADD COLUMN revenue DECIMAL(14, 2) DEFAULT 0;
        RAISE NOTICE 'Added revenue column to ad_spend_logs';
    END IF;
END $$;

-- 2. Add sync_range column to meta_sync_logs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'meta_sync_logs' AND column_name = 'sync_range'
    ) THEN
        ALTER TABLE meta_sync_logs ADD COLUMN sync_range TEXT DEFAULT 'single_day';
        RAISE NOTICE 'Added sync_range column to meta_sync_logs';
    END IF;
END $$;

-- 3. Add token_refreshed_at column to meta_connections
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'meta_connections' AND column_name = 'token_refreshed_at'
    ) THEN
        ALTER TABLE meta_connections ADD COLUMN token_refreshed_at TIMESTAMPTZ;
        RAISE NOTICE 'Added token_refreshed_at column to meta_connections';
    END IF;
END $$;

-- 4. Create index on revenue for reporting queries
CREATE INDEX IF NOT EXISTS idx_ad_spend_logs_revenue
    ON ad_spend_logs(revenue)
    WHERE revenue > 0;