# Supabase Migration History

> **Status**: Production database menggunakan migration v2–v98 (semua sudah applied, termasuk v73 indexes).
> Jangan re-run migration manapun yang sudah applied. File `migration-v86.sql` sengaja kosong (versi di-skip).
> Verifikasi status migrasi: `node scripts/check-migrations-status.mjs`

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
| v9-fix | `migration-v9-fix.sql` | Fix invoice FK auth.users → profiles |
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
| v73-fix | `migration-v73-fix.sql` | Fix: drop & recreate ad_spend_logs index (kolom tidak ada) |
| v74 | `migration-v74.sql` | Soft delete (deleted_at) untuk tabel kritis + trigger anti-hard-delete |
| v75 | `migration-v75.sql` | Chat Pro: reactions, mentions, typing, presence, message edits |
| v76 | `migration-v76.sql` | Fix race condition `generate_contract_number()` (COUNT+1 → duplikat) |
| v77 | `migration-v77.sql` | Content Studio: tabel content_uploads + caption_bank |
| v78 | `migration-v78.sql` | content_uploads & caption_bank (dashboard sheet import) |
| v79 | `migration-v79.sql` | Phase 2 major modules: leads, brand kits, monthly reports, dsb. |
| v80 | `migration-v80.sql` | tasks: kolom source_sheet, result_link, blockers |
| v81 | `migration-v81.sql` | content_plans: +9 kolom tracking produksi konten |
| v82 | `migration-v82.sql` | content_plans: kolom status (+index) — fix save failure |
| v83 | `migration-v83.sql` | production_schedules: kolom crew & deliverables |
| v84 | `migration-v84.sql` | Content Ads: kolom sheet "Content Ads" di content_uploads |
| v85 | `migration-v85.sql` | Creative deliverables versi (Google Drive, v1/v2/...) |
| v86 | `migration-v86.sql` | *(file kosong — versi di-skip, tidak ada operasi)* |
| v87 | `migration-v87.sql` | Client Strategy Canvas (OKR 2.0) + client_social_accounts |
| v88 | `migration-v88.sql` | content_plans: tema, thumbnail + safety net v81/v82 |
| v89 | `migration-v89.sql` | content_plans: reset "Proses Edit" lama → Draft + index link task |
| v90 | `migration-v90.sql` | Konsolidasi divisi "Content Production" → "Editor" |
| v91 | `migration-v91.sql` | Chat v2: user groups + group calls (Jitsi), chat_channel_members |
| v92 | `migration-v92.sql` | Fix chat groups & DM: CHECK constraint + RLS ('group' tidak lolos) |
| v93 | `migration-v93.sql` | Fix grup chat tidak muncul di sidebar (RLS batch insert) |
| v94 | `migration-v94.sql` | Ads Content Studio rework: ads_captions + ads_content_clusters |
| v95 | `migration-v95.sql` | ads_creative_requests (queue permintaan creative — OVI) |
| v96 | `migration-v96.sql` | ads_content_clusters: import per klien (TPDOC, SHUMI, Threenine, Hadona) |
| v97 | `migration-v97.sql` | Kolom MASTER "Ads Creative" publish spreadsheet (per objective/funnel) |
| v98 | `migration-v98.sql` | **Client delete protection & audit trail** (insiden cascade-delete 21 Agu 2026) |

## Database Tables (Final State)

### Core Tables
- `profiles` — User profiles with role, division, active status
- `clients` — Client accounts with contract info (+ soft delete v74, delete protection v98)
- `tasks` — Tasks with priority, status, due dates, sheet sync fields
- `task_assignees` — Many-to-many task ↔ user mapping
- `activity_logs` — Audit trail for all entity changes
- `client_deletion_audit` — Audit trail khusus delete client (v98)

### Ads & Marketing
- `ad_accounts` — Meta/Google ad account connections
- `ad_spend_logs` — Daily spend tracking
- `weekly_reports` — Weekly performance reports
- `report_metrics` — Individual metric values per report
- `report_objectives` — Campaign objective tracking
- `creative_performance` — Creative asset performance data
- `ads_captions` / `ads_content_clusters` — Ads content studio (v94, v96)
- `ads_creative_requests` — Queue permintaan creative (v95)

### Content & Strategy
- `content_plans` — Content calendar planning (+ kolom produksi v81–v89)
- `content_uploads` — Upload tracking (v77/78, diperluas v84)
- `caption_bank` — Bank caption (v77/78)
- `creative_assets` — Creative file references
- `strategy` — Client strategy documents
- `strategy_phases` — Strategy timeline phases
- `okrs` — Client Strategy Canvas / OKR 2.0 (v87)
- `client_social_accounts` — Aset digital client (v87)

### Production & Creative Ops
- `production_schedules` — Jadwal produksi + crew + deliverables (v83)
- `creative_deliverables` — Riwayat file hasil edit per versi (v85)

### Financial
- `invoices` — Invoice records
- `budget_pacing_alerts` — Budget threshold alerts
- `contracts` — Client contract management

### Communication
- `notifications` — In-app notifications (UUID PK)
- `notification_preferences` — Per-user notification settings
- `email_schedules` — Automated email report schedules
- `report_shares` — Public share tokens for reports
- `chat_channels` / `chat_messages` / `chat_read_status` — Chat realtime (v72)
- `chat_reactions`, typing/presence tables — Chat Pro (v75)
- `chat_channel_members` — Membership grup private (v91)

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

For new changes going forward, create `migration-v99.sql`, `v100.sql`, etc.

### Standalone runner scripts

Beberapa migrasi punya runner Node idempotent:
```bash
node scripts/run-migration-v98.mjs   # contoh terakhir
```

Runner membaca kredensial dari env (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`) — tidak ada hardcoded credential.

## Smoke Test

```bash
# Local (butuh dev server jalan di :3000)
TEST_EMAIL=xxx TEST_PASSWORD=xxx npm run test:smoke

# Production
TEST_EMAIL=xxx TEST_PASSWORD=xxx npm run smoke:prod
```

Menguji: login render, auth flow, dashboard, tasks, clients, reports, mobile overflow (390x844). Exit code non-zero jika ada fail — siap untuk CI.
