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

-- Update RLS policies to allow authenticated users to insert/update clients
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