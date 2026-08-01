# Supabase Migration History

> **Status**: Production database sudah menggunakan semua migration v2–v24.
> Jangan re-run migration manapun yang sudah applied.

## Quick Reference

| Version | File | Description | Lines |
|---------|------|-------------|-------|
| v2 | `migration-v2.sql` | Initial schema: profiles, clients, tasks, ad_accounts | ~ |
| v2-fix | `migration-v2-fix.sql` | Fix constraint issues from v2 | ~ |
| v3 | `migration-v3.sql` | Add weekly_reports, report_metrics tables | ~ |
| v4 | `migration-v4.sql` | Add content_plans, creative_assets tables | ~ |
| v5 | `migration-v5.sql` | Add strategy, strategy_phases tables | ~ |
| v6 | `migration-v6.sql` | Add file_attachments table | 34 |
| v8 | `migration-v8.sql` | Major: task_assignees, activity_logs, notifications, timesheets | 297 |
| v9 | `migration-v9.sql` | Add invoice tables | 82 |
| v9-fix | `migration-v9-fix.sql` | Fix invoice constraints | 35 |
| v10 | `migration-v10.sql` | Add calendar_events table | ~ |
| v11 | `migration-v11.sql` | Add email_schedules, report_shares tables | ~ |
| v12 | `migration-v12.sql` | Add goal_tracking table | ~ |
| v13 | `migration-v13.sql` | Add client import mappings | ~ |
| v14 | `migration-v14.sql` | Add ad_spend_logs table | ~ |
| v15 | `migration-v15.sql` | Add creative_performance tracking | ~ |
| v16 | `migration-v16.sql` | Add report_objectives table | ~ |
| v17 | `migration-v17.sql` | Add user_preferences table | ~ |
| v18 | `migration-v18.sql` | Add public report sharing tokens | ~ |
| v19 | `migration-v19.sql` | Add budget_pacing_alerts table | ~ |
| v20 | `migration-v20.sql` | Google OAuth: onboarding flow, profiles update | ~ |
| v21 | `migration-v21.sql` | Add role-based access control columns | ~ |
| v22 | `migration-v22.sql` | Add notification_preferences table | ~ |
| v23 | `migration-v23.sql` | Add dark_mode preference, UI settings | ~ |
| v24 | `migration-v24.sql` | Add notifications table (UUID-based, realtime) | ~ |
| prod-fix | `migration-production-fix.sql` | Emergency production fixes (indexes, RLS) | ~ |

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

### Communication
- `notifications` — In-app notifications (UUID PK)
- `notification_preferences` — Per-user notification settings
- `email_schedules` — Automated email report schedules
- `report_shares` — Public share tokens for reports

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

For new changes going forward, create `migration-v25.sql`, `v26.sql`, etc.