# Database Migrations — Hadona Workspace

> Status: 26 Agu 2026 · v98 = migration terakhir yang di-apply ke produksi.
> **Semua migration v2–v98 SUDAH di-apply ke produksi.** Jangan re-run migration lama tanpa review idempotency.

## Cara Apply Migration Baru

1. Buat file `supabase/migration-vXX.sql` (nomor = max existing + 1).
2. Tulis SQL **idempotent** (`IF NOT EXISTS`, `DROP IF EXISTS`, guard `DO $$`).
3. Apply via `scripts/run-migration-vXX.mjs` (copy template dari `scripts/run-migration-v98.mjs`) atau SQL Editor Supabase.
4. Update tabel di bawah + `src/types/database.ts` jika ada perubahan kolom.

## Urutan & Isi Migration

| Versi | Isi | Kategori |
|---|---|---|
| `schema.sql` | Schema awal lengkap | baseline |
| `fix-auth.sql` | Fix auth + create admin user (safe) | auth |
| v2 (+fix) | Ekspansi schema awal | core |
| v3–v4 | Perbaikan schema awal | core |
| v5 | Task comments & subtasks | task |
| v6 | Client contract & account management | contract |
| v8 | Activity logs & triggers | logging |
| v9 (+fix) | Timesheet & invoicing | finance |
| v10–v12 | Ads spend + Meta Ads integration | ads |
| v13–v14 | Fix RLS (auth users, report_metrics) | security |
| v15 | Shared reports (client portal token) | reports |
| v16 | Goal tracking (target CPA/ROAS/budget) | reports |
| v17 | Auto email scheduler weekly reports | reports |
| v18 | Creative performance tracker + security | reports |
| v19 | Goal tracker (rev) | reports |
| v20 | Division standardization & auth | auth |
| v21 | Fix handle_new_user trigger | auth |
| v22 | Multi-divisi untuk staff | auth |
| v23 | Profile enhancement + user management | auth |
| v24 | Notifications system | notification |
| v25–v26 | (invoice/billing) | finance |
| v27 | Recurring tasks + activity log | task |
| v28–v29 | Admin approval flow + fix | auth |
| v30–v31 | Activity logs system | logging |
| v32 | Creative revision tracking | creative |
| v33–v35 | Task approval, subtasks, timesheet | task |
| v36 | budget_alerts table (fix 404 dashboard) | dashboard |
| v37 | Supabase Storage bucket | storage |
| v38–v43 | Contract & billing system, RLS, auto-sync | contract/finance |
| v44 | (invoice fix) | finance |
| v45 | token_status meta_connections (fix B2/B3) | ads |
| v46–v54 | Reports/sheet sync & constraint fixes | reports |
| v55 | Fix generate_monthly_billing | finance |
| v56 | Calendar events (meeting management) | calendar |
| v57 | Prepaid contract + invoice PDF fields | finance |
| v58–v59 | Billing consolidation, contract_billing_id | finance |
| v60 (+fix) | Client communication log | clients |
| v61–v63 (+fix2) | clients columns, billing due_date/tax_rate | clients/finance |
| v64–v68 | Google Calendar integration + fixes | calendar |
| v69 | **CRITICAL RLS security fixes** | security |
| v70 | (chat prep) | chat |
| v71 | 2FA (TOTP) admin & finance | security |
| v72 | Team chat + video calls | chat |
| v73 (+fix) | Database performance (indexes) | perf |
| v74 | Soft delete critical tables | core |
| v75 | Chat pro (reactions, dll) | chat |
| v76 | Fix generate_contract_number() | contract |
| v77–v78 | Content Studio tables | content |
| v79–v80 | Sheet sync enhancements | content |
| v81–v82 | content_plans kolom tracking + status | content |
| v83 | Production module | production |
| v84 | Content Ads kolom dari sheet | content |
| v85 | Creative deliverables (Drive) | creative |
| v86 | (tanpa komentar header) | content |
| v87 | Client strategy (OKR) | strategy |
| v88–v89 | content_plans tema/thumbnail + reset status | content |
| v90 | Konsolidasi divisi "Content Production"→"Editor" | org |
| v91–v93 (+v92-dashboard) | Chat v2, grup chat fixes | chat |
| v94–v97 | Ads Content Studio rework + requests | content |
| v98 | **Client delete protection & audit trail** (insiden 21 Agu 2026) | security |
| v99 | Chat & penghapusan jalur DDL exec_sql (lihat DEPLOY-V99.md) | chat |
| v100 | **content_plans.sort_order** — urutan baris permanen + trigger auto-assign max+1 | content |
| v101 | Content plan → task sync (backfill editor tasks) | content |
| v102 | Meeting/Calendar flow (lihat scripts/run-migration-v102.mjs) | calendar |
| v103 | Push notif infra: push_subscriptions + RLS, RPC get_chat_unread_total, trigger pg_net relay | notif |
| v104 | **Fix notif chat/mention** (kolom salah di v103) + `push_config` (relay URL/secret via REST, bukan placeholder SQL) | notif |

**Catatan:** v7 & v70 tidak ada filenya di repo (v7 dilewati historis; v70 di dalam `migration` tanpa isi signifikan). `migration-all.sql` dan `migration-production-fix.sql` adalah bundel lama — JANGAN dipakai untuk fresh install tanpa review (tidak merepresentasikan state terkini).

## Area Risiko (jangan ubah tanpa deep review)

- **RLS policies** (v13, v14, v40, v69): salah ubah = kebocoran data.
- **Trigger `handle_new_user`** (v21): break = user baru gagal dibuat.
- **RPC billing** (v55, v58, v63-fix2): dipakai cron `auto-billing` produksi.
- **v90 divisi rename**: frontend `division-permissions.ts` tergantung nilai enum ini.
