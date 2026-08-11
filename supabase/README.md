# Supabase Migration History

> **Status**: Production database menggunakan migration v2–v72. Migration v73 (performance indexes) siap untuk di-apply.
> Jangan re-run migration manapun yang sudah applied.

## Quick Reference

| Version | File | Description |
|---------|------|-------------|
| v2 | `migration-v2.sql` | Initial schema: profiles, clients, tasks, ad_accounts |
| v2-fix | `migration-v2-fix.sql` | Fix constraint issues from v2 |
| v3 | `migration-v3.sql` | Add weekly_reports, report_metrics tables |
| v4 | `migration-v4.sql` | Add content_plans, creative_assets tables |
| v5 | `migration-v5.sql` | Add strategy, strategy_phases tables |
| v6 | `migration-v6.sql` | Add file_attachments table |
| v8 | `migration-v8.sql` | Major: task_assignees, activity_logs, notifications, timesheets |
| v9 | `migration-v9.sql` | Add invoice tables |
| v9-fix | `migration-v9-fix.sql` | Fix invoice constraints |
| v10–v24 | `migration-v10–v24.sql` | Calendar, email_schedules, goals, ad_spend_logs, preferences, RLS |
| v25–v45 | `migration-v25–v45.sql` | Reports sync, ads spend, creative, strategy, invoices, contracts |
| v46–v55 | `migration-v46–v55.sql` | Meta API token, sheet import, objective selector, metric formulas |
| v56–v60 | `migration-v56–v60.sql` | Cron auto-billing, division permissions, contract renewal, AE analytics |
| v61–v65 | `migration-v61–v65.sql` | Invoice PDF, dashboard widgets, calendar create-task, global search |
| v66–v69 | `migration-v66–v69.sql` | CSRF utility, API response helper, command palette, API client |
| v70 | `migration-v70.sql` | Security: 2FA/TOTP support, password reset, session management |
| v71 | `migration-v71.sql` | Auth pages: login, signup improvements, error boundaries |
| v72 | `migration-v72.sql` | Chat: channels, messages, read-status, realtime hook |
| v73 | `migration-v73.sql` | **Performance**: composite indexes for 10 high-traffic tables + ANALYZE |
| v73-fix | `migration-v73-fix.sql` | **FIX**: Drop & recreate ad_spend_logs index (reach/results/client_id tidak ada) |

## Database Tables (Final State)

### Core Tables
- `profiles` — User profiles with role, division, active status
- `clients` — Client accounts with contract info
- `tasks` — Tasks with priority, status, due dates
- `task_assignees` — Many-to-many task ↔ user mapping
- `activity_logs` — Audit trail for all entity changes

### Ads & Marketing
- `ad_accounts` — Meta/Google ad account connections
- `ad_spend_logs` — Daily spend tracking
- `weekly_reports` — Weekly performance reports
- `report_metrics` — Individual metric values per report
- `report_objectives` — Campaign objective tracking
- `creative_performance` — Creative asset performance data

### Content & Strategy
- `content_plans` — Content calendar planning
- `creative_assets` — Creative file references
- `strategy` — Client strategy documents
- `strategy_phases` — Strategy timeline phases

### Financial
- `invoices` — Invoice records
- `budget_pacing_alerts` — Budget threshold alerts
- `contracts` — Client contract management

### Communication
- `notifications` — In-app notifications (UUID PK)
- `notification_preferences` — Per-user notification settings
- `email_schedules` — Automated email report schedules
- `report_shares` — Public share tokens for reports
- `chat_channels` — Team chat channels
- `chat_messages` — Chat messages with realtime
- `chat_read_status` — Per-user channel read tracking

### System
- `file_attachments` — R2 file references with ownership
- `calendar_events` — Shared calendar events
- `user_preferences` — UI/theme preferences
- `goal_tracking` — KPI goal tracking per client

## Applying New Migrations

For fresh databases, use the consolidated file:
```bash
# Apply in order (already applied to prod — reference only)
psql -f supabase/migration-all.sql
```

For new changes going forward, create `migration-v74.sql`, `v75.sql`, etc.

### ⚠️ Pending Production Migration (v73)

```bash
# Run this on production to add performance indexes (safe, non-blocking):
psql -f supabase/migration-v73.sql
```

This migration adds composite indexes for:
- `ad_spend_logs` — dashboard queries, sync dedup
- `tasks` — kanban, workload widget, due date alerts
- `notifications` — unread badge count
- `chat_messages` / `chat_read_status` — realtime queries
- `invoices` — dashboard summary, aging
- `activity_logs` — activity feed
- `contracts` — renewal cron
- `reports` — dashboard listing
- `profiles` — admin user listing
- `clients` — filtered client listing

All use `CREATE INDEX IF NOT EXISTS` (idempotent, safe to re-run).