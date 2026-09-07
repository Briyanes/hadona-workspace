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
| v105 | Sanitasi mention `@[Nama](uuid)` → `@Nama` di body notif chat (push HP & lonceng) + cleanup notif lama | notif |
| v106 | **Notif assignee saat status task berubah** (review/blocked) — rewrite trigger v24/v26, fix kolom salah, kategori push_task di relay | notif |
| v107 | **Normalisasi divisi "Social Media Management" → "Social Media Manager"** di tasks + profiles (idempotent, fix 50 task tak terlihat di board divisi) | tasks |
| v108 | **Security hardening**: pin `search_path` 34 fn (memulihkan `get_chat_unread_total` dkk yang rusak 42P01), drop view `user_activity`, `security_invoker` view finansial, REVOKE anon exec SECURITY DEFINER, RLS `schema_migrations` — lihat DEPLOY-V108.md | security |
| v108b | **Fix pin search_path yang terskip di v108** (SET ROLE supabase_admin + fail-loud ALTER + report fn belum ter-pin) — jalankan SETELAH v108 | security |
| v108c | **Pin search_path v3** — exclude fungsi milik extension (pg_trgm op) yang bikin v108b fail; kumpulkan semua kegagalan sekaligus | security |
| v109d | **Fix drag task rusak** (42883 create_notification): DROP+CREATE `notify_task_status_change` (OID baru bunuh plan cache basi) + guard `to_regclass` task_assignees — File A fix, File B smoke terpisah | notif |
| v109e | **Fix assign member rusak** (42P01 tasks): DROP+CREATE `notify_task_assigned` (search_path dipin, OID baru) — bug kembar v109d, ada sejak v24 | notif |

**Catatan:** v7 & v70 tidak ada filenya di repo (v7 dilewati historis; v70 di dalam `migration` tanpa isi signifikan). `migration-all.sql` dan `migration-production-fix.sql` adalah bundel lama — JANGAN dipakai untuk fresh install tanpa review (tidak merepresentasikan state terkini).

## Area Risiko (jangan ubah tanpa deep review)

- **RLS policies** (v13, v14, v40, v69): salah ubah = kebocoran data.
- **Trigger `handle_new_user`** (v21): break = user baru gagal dibuat.
- **RPC billing** (v55, v58, v63-fix2): dipakai cron `auto-billing` produksi.
- **v90 divisi rename**: frontend `division-permissions.ts` tergantung nilai enum ini.

## v108 series — Security Hardening (REVOKE PUBLIC + pin search_path) — 2026-07-09
- **v108** REVOKE PUBLIC dari RPC/view + REVOKE anon storage → ✅ ter-apply (anon kini 401)
- **v108b** pin search_path massal → ❌ gagal (fungsi milik extension tak bisa di-ALTER)
- **v108c** pin search_path (exclude extension-owned, per-fungsi) → ✅ ter-apply
- **v108d** diagnosis → bukti: definisi benar & tabel ada, tapi RPC tetap 42P01 → **stale plan cache PostgREST**
- **v108e** DROP+CREATE fn → ❌ gagal (2BP01: fn dirujuk 3 RLS policy chat)
- **v108f** capture via pg_get_policydef → ❌ gagal (fungsi itu tidak ada di Postgres)
- **v108g** rekonstruksi policy dari pg_policy (pg_get_expr) + DROP+CREATE fn (OID baru) + re-apply REVOKE → ✅ **SUKSES, verify all-green**
- Pelajaran: (1) ALTER search_path tidak membatalkan plan cache basi — butuh OID baru (DROP+CREATE); (2) fn yang dirujuk RLS policy harus drop policy dulu; (3) selalu `NOTIFY pgrst, 'reload schema'` setelah ubah grants.

## v109 series — Fix trigger notifikasi task pasca-v108 — 2026-07-09
**Gejala:** drag task gagal `42883 create_notification does not exist` (fn itu pernah dibuat di sesi sebelumnya tapi rollback menelan DROP-nya).
- **v109/v109b/v109c** create dulu `create_notification` di transaksi sama → ❌ tetap 42883 (fungsi trigger lama menolak re-resolve; pola plan cache yang sama dgn v108d)
- **v109c-B** diagnostik → `task_assignees` ADA di public + RLS aktif (kontradiksi dgn error 42P01 lama = bukti resolusi basi, bukan tabel hilang)
- **v109d-A** DROP+CREATE `notify_task_status_change` (OID baru) + guard `to_regclass('public.task_assignees')` → ✅ drag pulih (E2E: flip status 200, 2 notif task_updated)
- **v109d-B** smoke test file terpisah (kegagalan smoke tidak me-rollback fix)
- **v109e** E2E temukan bug kembar: insert assignee 42P01 `tasks` — `notify_task_assigned` (v24, SECURITY DEFINER tanpa search_path pin, tidak tersentuh v108c) → DROP+CREATE dgn pin → ✅ assign pulih (201 + notif task_assigned)
- Verify: `node scripts/verify-migration-v109.mjs` (net-zero, semua jejak dibersihkan) — TES 1–3 all-green
- Pelajaran: fn SECURITY DEFINER tanpa `SET search_path` bisa "bertahan" bertahun-tahun lalu rusak saat environment search_path berubah (v108); audit lanjutan = cari semua fn SECURITY DEFINER yang belum ter-pin — lihat v108b/c report.
