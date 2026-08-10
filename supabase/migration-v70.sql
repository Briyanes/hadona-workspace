-- ═══════════════════════════════════════════════════════════════════════
-- Migration v70: Performance Indexes untuk Dashboard & Search
-- Created by: Audit Phase 4 — Performance Optimization
--
-- Menambahkan composite indexes untuk query yang sering lambat:
-- 1. ae-analytics: query by assigned_to + created_at
-- 2. activity_logs: query by entity_type + created_at DESC
-- 3. Global search: ilike pada name/title/invoice_number
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Tasks: dashboard query by assignee + date range
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_created
  ON tasks (assigned_to, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
  ON tasks (status, priority);

-- 2. Activity Logs: filter by entity type + recent first
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_created
  ON activity_logs (entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
  ON activity_logs (user_id, created_at DESC);

-- 3. Clients: search by name/company (ilike pattern)
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
  ON clients USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_clients_company_trgm
  ON clients USING gin (company gin_trgm_ops);

-- 4. Invoices: search by invoice number + status filter
CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm
  ON invoices USING gin (invoice_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_status_date
  ON invoices (status, due_date);

-- 5. Reports: filter by client + week
CREATE INDEX IF NOT EXISTS idx_reports_client_week
  ON reports (client_id, report_week DESC);

-- 6. Notifications: user unread first
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications (user_id, read, created_at DESC);

-- 7. Enable trigram extension for ilike optimization (if not exists)
CREATE EXTENSION IF NOT EXISTS pg_trgm;