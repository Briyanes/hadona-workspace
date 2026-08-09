-- Migration v62: Add email, phone, status, address columns to clients table
-- This fixes: "Could not find the 'email' column of 'clients' in the schema cache"
-- when creating a new client from the Invoice modal

-- Add columns if they don't exist (idempotent)
DO $$
BEGIN
  -- email
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'email') THEN
    ALTER TABLE public.clients ADD COLUMN email text;
  END IF;

  -- phone
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'phone') THEN
    ALTER TABLE public.clients ADD COLUMN phone text;
  END IF;

  -- address
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'address') THEN
    ALTER TABLE public.clients ADD COLUMN address text;
  END IF;

  -- status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'status') THEN
    ALTER TABLE public.clients ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- ============================================================
-- SLUG SAFETY: Auto-generate slug from name if not provided
-- This is a DB-level fallback so INSERT never fails on slug NULL
-- ============================================================

-- Create or replace function to auto-generate slug
CREATE OR REPLACE FUNCTION public.generate_client_slug()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate if slug is NULL or empty
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(NEW.name);
    -- Replace spaces and special chars with hyphens
    NEW.slug := regexp_replace(NEW.slug, '[^a-z0-9]+', '-', 'g');
    -- Trim leading/trailing hyphens
    NEW.slug := regexp_replace(NEW.slug, '^-+|-+$', '', 'g');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_clients_slug ON public.clients;
CREATE TRIGGER trg_clients_slug
  BEFORE INSERT OR UPDATE OF name, slug ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_client_slug();

-- ============================================================
-- RLS POLICIES
-- ============================================================
-- (This ensures the "Tambah Client Baru" feature works for all roles)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any, then recreate
DROP POLICY IF EXISTS "clients_select_all" ON public.clients;
DROP POLICY IF EXISTS "clients_insert_all" ON public.clients;
DROP POLICY IF EXISTS "clients_update_all" ON public.clients;

-- Allow all authenticated users to read clients
CREATE POLICY "clients_select_all" ON public.clients
  FOR SELECT TO authenticated USING (true);

-- Allow all authenticated users to insert clients
CREATE POLICY "clients_insert_all" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow all authenticated users to update clients
CREATE POLICY "clients_update_all" ON public.clients
  FOR UPDATE TO authenticated USING (true);