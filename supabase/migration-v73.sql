-- ============================================================
-- Migration v73: Database Performance Index Audit
-- Add missing composite indexes for high-traffic tables
-- ============================================================

-- 1. ad_spend_logs: Composite indexes untuk query patterns yang sering dipakai
--    (dashboard queries by date range + account, sync queries by client)

-- Index untuk filter by ad_account + date range (dashboard charts)
--    NOTE: Hanya include kolom dari schema dasar v10 (spend, impressions, clicks)
--    Kolom reach hanya ada jika v19 sudah di-apply; results TIDAK ADA di schema manapun
CREATE INDEX IF NOT EXISTS idx_ad_spend_logs_account_date_range
  ON public.ad_spend_logs(ad_account_id, log_date DESC)
  INCLUDE (spend, impressions, clicks);

-- Index untuk sync dedup check (account + date unique lookup)
CREATE INDEX IF NOT EXISTS idx_ad_spend_logs_sync_lookup
  ON public.ad_spend_logs(ad_account_id, log_date)
  WHERE deleted_at IS NULL;

-- 2. tasks: Index untuk dashboard kanban + workload widget
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status
  ON public.tasks(assignee_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
  ON public.tasks(status, priority DESC, due_date ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON public.tasks(due_date ASC)
  WHERE status NOT IN ('done', 'cancelled') AND deleted_at IS NULL;

-- 3. notifications: Index untuk unread badge count (realtime queries)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC)
  WHERE is_read = false;

-- 4. chat_messages: Index untuk channel-based realtime queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON public.chat_messages(channel_id, created_at DESC);

-- Index untuk unread count per channel per user
CREATE INDEX IF NOT EXISTS idx_chat_read_status_user_channel
  ON public.chat_read_status(user_id, channel_id);

-- 5. invoices: Index untuk dashboard summary + aging
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date
  ON public.invoices(status, due_date ASC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_client_status
  ON public.invoices(client_id, status);

-- 6. activity_logs: Index untuk dashboard activity feed
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_desc
  ON public.activity_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity
  ON public.activity_logs(entity_type, entity_id, created_at DESC);

-- 7. contracts: Index untuk renewal cron + client lookup
CREATE INDEX IF NOT EXISTS idx_contracts_end_date_status
  ON public.contracts(end_date ASC, status);

-- 8. reports: Index untuk dashboard + report listing
CREATE INDEX IF NOT EXISTS idx_reports_client_date
  ON public.reports(client_id, report_date DESC)
  WHERE deleted_at IS NULL;

-- 9. profiles: Index untuk user listing + admin queries
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status
  ON public.profiles(approval_status, created_at DESC);

-- 10. clients: Index untuk client listing dengan filter
CREATE INDEX IF NOT EXISTS idx_clients_status_created
  ON public.clients(status, created_at DESC);

-- ============================================================
-- ANALYZE tables to update planner statistics
-- ============================================================
ANALYZE public.ad_spend_logs;
ANALYZE public.tasks;
ANALYZE public.notifications;
ANALYZE public.chat_messages;
ANALYZE public.invoices;
ANALYZE public.activity_logs;
ANALYZE public.contracts;
ANALYZE public.reports;
ANALYZE public.profiles;
ANALYZE public.clients;