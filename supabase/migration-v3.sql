-- ============================================
-- HADONA WORKSPACE - MIGRATION v3
-- Fix: Add created_at to ad_accounts for consistency
-- Run this in Supabase SQL Editor
-- ============================================

-- Add created_at column to ad_accounts (was missing in schema.sql)
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill existing rows with updated_at as approximation
UPDATE public.ad_accounts SET created_at = updated_at WHERE created_at IS NULL;

-- Create index for created_at
CREATE INDEX IF NOT EXISTS idx_ad_accounts_created_at ON public.ad_accounts(created_at);