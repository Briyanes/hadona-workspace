-- ═══════════════════════════════════════════════════════════════════════
-- Migration v70: Performance Indexes untuk Dashboard & Search
-- Created by: Audit Phase 4 — Performance Optimization
-- FIXED: Corrected column/table names to match actual schema
--
-- Menambahkan composite indexes untuk query yang sering lambat:
-- 1. Tasks: query by created_by + created_at (tasks tidak punya assigned_to)
-- 2. Task Assignees: lookup by user_id + task_id (many-to-many)
-- 3. Activity Logs: query by entity_type + created_at DESC
-- 4. Global search: ilike pada name/title/invoice_number
-- 5. Weekly Reports: filter by client + period_start
-- 6. Notifications: user unread first
-- ═══════════════════════════════════════════════════════════════════════

-- 0. Enable trigram extension for ilike optimization FIRST
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Tasks: dashboard query by creator + date range
-- NOTE: tasks table does NOT have assigned_to column; uses task_assignees many-to-many
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_created
  ON tasks (created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
  ON tasks (status, priority);

-- 2. Task Assignees: lookup by user_id + task_id (many-to-many junction table)
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_task
  ON task_assignees (user_id, task_id);

-- 3. Activity Logs: filter by entity type + recent first
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_created
  ON activity_logs (entity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created
  ON activity_logs (user_id, created_at DESC);

-- 4. Clients: search by name (ilike pattern) — clients table has NO company column
CREATE INDEX IF NOT EXISTS idx_clients_name_trgm
  ON clients USING gin (name gin_trgm_ops);

-- 5. Invoices: search by invoice number + status filter
CREATE INDEX IF NOT EXISTS idx_invoices_number_trgm
  ON invoices USING gin (invoice_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_invoices_status_date
  ON invoices (status, due_date);

-- 6. Weekly Reports: filter by client + period (table is weekly_reports, NOT reports)
CREATE INDEX IF NOT EXISTS idx_weekly_reports_client_period
  ON weekly_reports (client_id, period_start DESC);

-- 7. Notifications: user unread first (column is is_read, NOT read)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications (user_id, is_read, created_at DESC);

-- 8. Record migration
INSERT INTO public.schema_migrations (version, filename)
VALUES ('v70', 'migration-v70.sql')
ON CONFLICT (version) DO NOTHING;