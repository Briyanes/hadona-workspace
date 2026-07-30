-- ============================================
-- Migration V9: Timesheet & Invoicing
-- ============================================

-- 1. Timesheet table
CREATE TABLE IF NOT EXISTS public.timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  activity_type TEXT DEFAULT 'general',
  description TEXT,
  billable BOOLEAN NOT NULL DEFAULT true,
  hourly_rate DECIMAL(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheets_user_date ON public.timesheets(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_timesheets_client_date ON public.timesheets(client_id, date DESC);

ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Timesheets viewable by authenticated"
  ON public.timesheets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Timesheets insert by authenticated"
  ON public.timesheets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Timesheets update by owner"
  ON public.timesheets FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Timesheets delete by owner"
  ON public.timesheets FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================
-- 2. Invoice table
-- ============================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax DECIMAL(14,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  paid_date DATE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invoices viewable by authenticated"
  ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Invoices insert by authenticated"
  ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Invoices update by authenticated"
  ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Invoices delete by authenticated"
  ON public.invoices FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timesheets_updated ON public.timesheets;
CREATE TRIGGER trg_timesheets_updated BEFORE UPDATE ON public.timesheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON public.invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();