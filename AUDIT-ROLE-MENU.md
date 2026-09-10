# 🔐 AUDIT ROLE & MENU ACCESS — Team Work Hadona

> **Tanggal:** 9 Oktober 2026 · **Auditor:** Tim Ahli (Security, RBAC, Frontend)  
> **Permintaan Bisnis:** Audit semua role/scope menu terbuka & terkunci + 3 perubahan permission

---

## ⚡ Ringkasan Eksekutif

Audit menemukan sistem permission 3-lapis yang konsisten (menu map → middleware → sidebar), dengan RLS database yang longgar untuk data operasional. **3 perubahan diterapkan** (AE→Ads Spend & Invoices, Users→super_admin only), semuanya di layer aplikasi tanpa migration DB.

| # | Perubahan | Sebelum | Sesudah |
|---|---|---|---|
| 1 | `/ads-spend` untuk AE | 🔒 Locked | ✅ Full access |
| 2 | `/invoices` untuk AE | 🚫 Hidden | ✅ Full access (hidden utk divisi lain) |
| 3 | `/users` | ✅ PM + super_admin (hidden) | ✅ **super_admin ONLY** — 🔒 locked untuk semua lainnya **termasuk PM** |

---

## 🏗️ Arsitektur Permission (3 lapis)

```
1. src/lib/division-permissions.ts  → MENU_ACCESS (single source of truth)
2. src/middleware.ts                → page guard (redirect jika !canAccessRoute)
3. src/components/ui/sidebar.tsx    → render: full | 🔒 locked | hidden
```

- **Tier 1** — semua user: Dashboard, Tasks, Calendar, Timesheet
- **Tier 2** — divisi-specific: tampil 🔒 jika tidak sesuai divisi
- **Tier 3** — management only: HIDDEN untuk yang tak berhak
- **Roles khusus:** `super_admin` = full semua menu; `project_manager` = full semua menu Tier 2/3 **kecuali `/users`** (sejak perubahan ini)

## 📊 Matriks Lengkap: Divisi × Menu (SETELAH perubahan)

Legenda: ✅ full · 🔒 locked · 🚫 hidden — *SA = super_admin (selalu ✅), PM-role = project_manager*

| Menu | CD | CC | Edt | SMM | Prd | Adv | **AE** | CW | Dev | PM-role |
|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard `/` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tasks | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calendar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timesheet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clients | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ | ✅ | ✅ | ✅ |
| **Ads Spend** 🆕 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | **✅** | 🔒 | ✅ | ✅ |
| Reports | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ |
| Monthly Reports | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ |
| Strategy | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ |
| Content Plans | ✅ | ✅ | ✅ | ✅ | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ |
| Content Studio | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ | 🔒 | ✅ |
| Leads | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | 🔒 | ✅ |
| Approvals | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ |
| Production | ✅ | ✅ | ✅ | 🔒 | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | ✅ |
| Brand Kits | ✅ | ✅ | 🔒 | 🔒 | ✅ | 🔒 | ✅ | ✅ | 🔒 | ✅ |
| **Invoices** 🆕 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | **✅** | 🚫 | 🚫 | ✅ |
| **Users** 🔒🆕 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | **🔒** |

CD=Creative Director, CC=Content Creator, Edt=Editor, SMM=Social Media Mgr, Prd=Production, Adv=Advertiser, AE=Account Executive, CW=Copywriter, Dev=Developer

---

## 🔍 Detail Perubahan

### 1. Account Executive → `/ads-spend` (dibuka)
`allowedDivisions` + `"Account Executive"`. RLS sudah terbuka (`ad_accounts`, `ad_spend_logs`, `clients` = semua `authenticated`) → tanpa hambatan DB. Catatan: `meta_connections` own-or-manager — AE hanya lihat koneksi Meta miliknya sendiri (by design, sama seperti Advertiser non-owner).

### 2. Account Executive → `/invoices` (dibuka)
`allowedDivisions` + `"Account Executive"` (tetap `hiddenIfUnauthorized` → divisi lain tidak melihat menu sama sekali). RLS `invoices` (migration-v9) sudah CRUD untuk semua `authenticated`. **Bonus konsistensi:** PDF API (`/api/invoices/[id]/pdf`) memakai `canAccessRoute("/invoices", …)` → AE otomatis boleh unduh PDF; divisi lain tetap 403.

### 3. `/users` → super_admin ONLY (diketatkan)
- **Menu:** `allowedDivisions: []`, `allowedRoles: ["super_admin"]`, tanpa `hiddenIfUnauthorized` → tampil 🔒 untuk semua non-SA **termasuk divisi Project Manager & role project_manager** (sebelumnya hidden-only-PM-can-see).
- **API `/api/admin/users`:** `allowedRoles` `["super_admin","project_manager"]` → `["super_admin"]`. **Ini krusial** — tanpa ini PM yang menu-nya digembok tetap bisa memanipulasi user (approve/reject/invite/delete) via API langsung. GET/POST/DELETE semuanya lewat `verifyAdmin()` yang sama.
- Dashboard stat card "Team Members" → `/users` kini jadi dead-end utk PM (middleware redirect) — UX minor, dicatat di backlog.

## 🛡️ Temuan Keamanan Terkait

- ✅ **No regression**: `project_manager` role tetap full untuk semua menu lain (allowedRoles di tiap menu).
- ✅ **PDF invoice API** (fix sesi sebelumnya) otomatis mengikuti peta baru.
- ⚠️ **Backlog (P2, existing):** RLS `invoices`/`ad_spend_logs`/`ad_accounts`/`clients` longgar (semua authenticated bisa CRUD langsung via Supabase key dari browser). Menu-lock hanya UX + middleware guard. Jika ingin data-financial grade, perlu RLS berbasis division/role — dampak luas, jadikan proyek terpisah.

## ✅ Verifikasi

1. `npx tsc --noEmit` → 0 error
2. Sanity logic (dari `checkMenuAccess`):
   - AE + role biasa → `/ads-spend` = **full**, `/invoices` = **full**, `/users` = **locked**
   - PM division + role `project_manager` → `/users` = **locked** (role tak lagi di allowedRoles), semua menu lain full
   - `super_admin` → semua = **full**
   - Content Creator → `/invoices` = **hidden**, `/users` = **locked**
3. Regression: middleware & sidebar tanpa perubahan kode — otomatis mengikuti `MENU_ACCESS`

## 📦 File yang Diubah

| File | Perubahan |
|---|---|
| `src/lib/division-permissions.ts` | `/ads-spend` +AE, `/invoices` +AE, `/users` super_admin-only locked, update komentar tier |
| `src/app/api/admin/users/route.ts` | `verifyAdmin` hanya `super_admin` (defense in depth) |
| `AUDIT-ROLE-MENU.md` | **BARU** — laporan ini (matriks lengkap) |

**Tanpa migration DB.** Deploy = push (Vercel auto-deploy).

## 🎯 Kesimpulan Tim

> Ketiga permintaan terpenuhi dengan 2 file yang diedit — bukti arsitektur permission terpusat yang sehat. Menu Users kini benar-benar eksklusif super_admin di SEMUA lapis (UI + middleware + API). AE memperoleh akses penuh Ads Spend & Invoices sesuai kebutuhan bisnis mengelola klien.