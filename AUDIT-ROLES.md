# 🔐 Audit Permission Matrix — Divisi & Role

> **Tanggal:** 9 September 2026
> **Scope:** Menu access semua divisi expert (10 divisi) × 17 menu
> **Sumber:** `src/lib/division-permissions.ts` (MENU_ACCESS) · `src/middleware.ts` (guard) · `src/components/ui/sidebar.tsx` (lock UI) · RLS Supabase (data layer)

---

## 1. Ringkasan Eksekutif

| # | Temuan | Severity | Status |
|---|--------|----------|--------|
| 1 | **Creative Director tidak bisa akses menu Strategy (OKR)** — tidak terdaftar di `allowedDivisions` untuk `/strategy` | 🐛 Bug (permintaan user) | ✅ **FIXED** — sudah ditambahkan |
| 2 | Social Media Manager tidak punya akses `/strategy` — padahal sering mengelola OKR konten client | ⚠️ Perlu keputusan bisnis | 📋 Catatan |
| 3 | Editor tidak punya akses `/clients` & `/approvals` | ⚠️ Perlu keputusan bisnis | 📋 Catatan |
| 4 | Social Media Manager tidak punya akses `/content-studio` | ⚠️ Perlu keputusan bisnis | 📋 Catatan |
| 5 | RLS `okrs` & `clients` sudah `select_all` (authenticated) — aman untuk read, tidak perlu migration | ✅ OK | — |
| 6 | Role `advertiser` ada di `ROLES` const tapi tidak pernah dipakai sebagai gate khusus | ℹ️ Info | — |

---

## 2. Cara Kerja Permission (Arsitektur)

```
User login → middleware.ts
  └─ canAccessRoute(pathname, division[], role)  ← dari division-permissions.ts
       ├─ 'full'   → halaman dibuka
       └─ locked/hidden → redirect /?error=access_denied

Sidebar (sidebar.tsx)
  └─ checkMenuAccess(item.href, division[], role)
       ├─ 'full'   → link aktif
       ├─ 'locked' → tampil 🔒 + toast "untuk divisi: ..."
       └─ 'hidden' → tidak tampil sama sekali (Tier 3)
```

**Aturan:**
- Role `super_admin` → **selalu full** untuk semua menu.
- Role `project_manager` → full via `allowedRoles` di semua menu.
- Divisi adalah **array** — user bisa punya multiple divisi (OR logic).
- Menu tanpa config (mis. `/chat`, `/settings`) → default **full** semua user.

---

## 3. Matrix Permission Lengkap

Legenda: ✅ = full · 🔒 = locked (tampil tapi dikunci) · 🚫 = hidden · — = N/A

| Menu | CD | CC | ED | SM | PR | PM | ADV | AE | CW | DEV | Admin-only? |
|------|:--:|:--:|:--:|:--:|:--:|:--:|:---:|:--:|:--:|:---:|:---:|
| `/` Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `/tasks` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `/calendar` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `/timesheet` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `/clients` | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | ✅ | — |
| `/leads` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✅ | 🔒 | 🔒 | — |
| `/invoices` | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | **Tier 3** |
| `/ads-spend` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | 🔒 | ✅ | — |
| `/reports` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✅ | 🔒 | ✅ | — |
| `/monthly-reports` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✅ | 🔒 | ✅ | — |
| `/strategy` **(OKR)** | ✅ **← FIX** | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | ✅ | 🔒 | ✅ | — |
| `/content-plans` | ✅ | ✅ | ✅ | ✅ | 🔒 | ✅ | 🔒 | 🔒 | ✅ | 🔒 | — |
| `/content-studio` | 🔒 | 🔒 | 🔒 | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | 🔒 | — |
| `/production` | ✅ | ✅ | ✅ | 🔒 | ✅ | ✅ | 🔒 | 🔒 | 🔒 | 🔒 | — |
| `/brand-kits` | ✅ | ✅ | 🔒 | 🔒 | ✅ | ✅ | 🔒 | ✅ | ✅ | 🔒 | — |
| `/approvals` | ✅ | ✅ | 🔒 | 🔒 | 🔒 | ✅ | 🔒 | ✅ | ✅ | 🔒 | — |
| `/chat` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | default |
| `/users` | 🚫 | 🚫 | 🚫 | 🚫 | 🚫 | ✅ | 🚫 | 🚫 | 🚫 | 🚫 | **Tier 3** |
| `/settings` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | default |

**Keterangan singkatan divisi:**
CD = Creative Director · CC = Content Creator · ED = Editor · SM = Social Media Manager · PR = Production · PM = Project Manager · ADV = Advertiser · AE = Account Executive · CW = Copywriter · DEV = Developer

**Catatan role:** `super_admin` & `project_manager` (role, bukan divisi) selalu ✅ semua menu.

---

## 4. Detail Temuan

### ✅ 4.1 FIX — Creative Director → Strategy (OKR)

**Sebelum:**
```ts
{
  href: "/strategy",
  allowedDivisions: ["Account Executive", "Project Manager", "Advertiser", "Developer"],
  ...
}
```

**Sesudah:**
```ts
{
  href: "/strategy",
  allowedDivisions: ["Account Executive", "Project Manager", "Advertiser", "Developer", "Creative Director"],
  ...
}
```

**Efek otomatis (single source of truth):**
1. Sidebar → menu "Strategy (OKR)" tidak lagi 🔒 untuk divisi Creative Director.
2. Middleware → `canAccessRoute("/strategy", ["Creative Director"], ...)` sekarang `true`, tidak redirect `?error=access_denied`.
3. Data → RLS `okrs_select_all`, `clients_select_all`, `client_social_accounts` dsb. sudah terbuka untuk semua authenticated user, jadi Creative Director langsung bisa lihat Client Strategy Canvas + Agency OKR + check-in progress.

**File yang diubah:** `src/lib/division-permissions.ts` (1 baris).

### ⚠️ 4.2 Catatan — Social Media Manager & `/strategy`
SM Manager mengelola konten & performa sosmed client, tapi tidak melihat OKR client. Jika dirasa perlu (mis. untuk menyusun content plan berbasis target), tambahkan `"Social Media Manager"` ke `allowedDivisions` `/strategy`. **Saat ini TIDAK diubah** — menunggu keputusan bisnis.

### ⚠️ 4.3 Catatan — Editor & `/clients`, `/approvals`
Editor perlu brief client untuk mengedit video, tapi menu Clients terkunci. Alternatif saat ini: brief tersalurkan via Tasks/Content Plans (yang memang terbuka). Jika Editor perlu self-serve lihat profil client, tambahkan `"Editor"` ke `/clients`.

### ⚠️ 4.4 Catatan — Social Media Manager & `/content-studio`
SM Manager justru tidak punya akses Content Studio (hanya Copywriter & Advertiser), padahal CC/CD/Editor bisa production. Perlu konfirmasi apakah ini disengaja.

### ℹ️ 4.5 Role `advertiser` tidak terpakai sebagai gate
`ROLES.ADVERTISER` didefinisikan tapi tidak muncul di `allowedRoles` mana pun — akses advertiser berjalan lewat **divisi** "Advertiser". Tidak berbahaya, hanya cleanup opsional.

---

## 5. RLS Database (Data Layer) — Ringkasan

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `okrs` | ✅ semua authenticated | ✅ semua authenticated | owner atau manager | manager saja |
| `clients` | ✅ semua authenticated | ✅ semua authenticated | semua authenticated | manager saja |

**Implikasi:** Membuka menu `/strategy` untuk Creative Director **cukup di app layer** (sudah dikerjakan) — tidak perlu migration SQL tambahan untuk read. Untuk **mengubah** OKR milik orang lain, tetap dibatasi RLS (owner/manager) — ini sesuai best practice.

---

## 6. Rekomendasi Next Step (Opsional)

1. **Konfirmasi bisnis** untuk temuan 4.2–4.4 (SM Manager & Editor).
2. Pertimbangkan penambahan **toast/hint di halaman `/strategy`** untuk user tanpa write-access (read-only indicator) — saat ini tombol edit/check-in tetap tampil tapi akan gagal via RLS dengan pesan error Supabase.
3. Tambahkan unit test untuk `checkMenuAccess()` — helper ini adalah single point of failure permission; saat ini belum ada test file.

---

*Dokumen ini dihasilkan oleh audit otomatis + review manual. Update terakhir setelah fix Creative Director → Strategy (OKR).*