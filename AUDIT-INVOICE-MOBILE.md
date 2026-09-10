# 📱 AUDIT INVOICE MOBILE — Team Work Hadona

> **Tanggal:** 9 Oktober 2026 · **Auditor:** Tim Ahli (Mobile UX, Security, QA, Engineering)  
> **Pertanyaan Bisnis:** *"Apakah generate invoice bisa dilakukan lewat mobile?"*

---

## ⚡ Jawaban Singkat

**YA, bisa** — membuat invoice (form modal), menandai lunas, dan mengunduh PDF **berfungsi dari browser mobile**.  
Namun audit menemukan **2 blocker** (sudah diperbaiki dalam sesi ini):

| # | Blocker | Status |
|---|---|---|
| 1 | Tombol **Edit & Hapus** invoice tidak bisa diakses via sentuhan (invisible tanpa hover) | ✅ **FIXED** |
| 2 | **PDF API tanpa authorization** — user non-manajemen bisa unduh PDF invoice siapa pun (IDOR, data finansial) | ✅ **FIXED** |

---

## 🏗️ Arsitektur Alur Invoice

### 1. Buat / Edit Invoice (✅ mobile-ready)
- Modal `New Invoice` → bottom-sheet di mobile (`fixed bottom-0`, drag-handle, safe-area, scrollable).
- Form: nomor invoice (auto-generate), client (select / inline baru), tanggal, **line items builder**, pajak, status, catatan.
- Fondasi mobile sudah kuat (dari audit modal sebelumnya): font 16px anti-zoom iOS, date input `min-width:0`, no-spinner.
- Direct Supabase client → RLS aktif.

### 2. Download PDF (⚠️ → ✅ diperbaiki)
- **Sebelum:** `window.open('/api/invoices/[id]/pdf')` → silent-fail di iOS Safari & PWA standalone; tanpa error handling.
- **Sesudah:** `fetch` blob → `<a download>` + spinner per-baris + toast error (401/403/5xx/network) + filename dari `Content-Disposition`.

### 3. Print (⚠️ partial)
- `window.print()` + `PrintableInvoice` — bekerja di browser iOS 13+ / Android Chrome.
- Di PWA standalone (`display: "standalone"`) tetap tidak reliable — gunakan browser biasa, atau unduh PDF.
- Print CSS **duplikat & bertentangan** → dikonsolidasi (lihat fix #7).

### 4. Akses & Permission
- `/invoices` = Tier 3 **Management Only** (`hiddenIfUnauthorized`): PM division, `super_admin`, `project_manager`. Sidebar desktop & drawer mobile konsisten — non-PM tidak melihat menu.
- **Gap ditemukan:** proteksi hanya di UI (middleware page-guard), **tidak di PDF API** → fixed (lihat #2).

---

## 🔍 Temuan Detail & Perbaikan

### 🔴 CRITICAL

**#1 — Tombol aksi invisible di touch device**  
`opacity-0 group-hover:opacity-100` pada tombol Edit/Hapus (`invoices/page.tsx`). Touch tidak punya hover → tombol tak terlihat & tak bisa diketuk.  
**Fix:** `opacity-100 sm:opacity-0 sm:group-hover:opacity-100` — selalu tampil di <640px, hover-reveal di desktop.

**#2 — IDOR di PDF API (`/api/invoices/[id]/pdf`)**  
Route hanya memeriksa "sudah login" lalu memakai **service-role key (bypass RLS)**. Setiap user ter-autentikasi bisa mengunduh PDF invoice **siapa pun** via ID enumeration.  
**Fix:** Fetch `profiles` (division, role) via auth client → `canAccessRoute("/invoices", …)` sebelum service-role dipakai. Non-PM → **403**. Deny-by-default bila profil tidak ditemukan.

### 🟠 HIGH

**#3 — Touch target terlalu kecil**  
Tombol aksi `p-1.5` + ikon 14px ≈ 26px (standar: 44px Apple HIG / 48px Material).  
**Fix:** `min-h-[44px] min-w-[44px]` di mobile, compact via `sm:` override. Container `flex-wrap` agar 5 tombol tidak terpotong.

**#4 — `window.open` PDF tanpa error handling** → **FIXED** (blob download + toast, lihat atas).

### 🟡 MEDIUM

**#5 — Bug timezone tanggal**  
`new Date().toISOString().split("T")[0]` = UTC → issue/due/paid date bisa **mundur 1 hari** sebelum 07:00 WIB.  
**Fix:** helper `localDateStr()` (getter lokal) dipakai di `emptyForm`, `openCreate` (due +14 hari), `handleSave`, `quickStatus`, `todayStr`.

**#6 — Filename PDF tidak disanitasi**  
Nama client bebas teks — karakter `"` `,` CRLF dapat merusak header `Content-Disposition`.  
**Fix:** sanitasi (strip `"` `\` CR/LF, max 60 char) + `filename*=UTF-8''…` (RFC 5987).

**#7 — Print CSS duplikat & `position: fixed`**  
Dua blok `@media print` saling menimpa; `position: fixed` membuat invoice multi-halaman **hanya tercetak halaman 1**; rule `body.printing` dead-code (tidak pernah di-set JS).  
**Fix:** konsolidasi 1 blok; `absolute` multi-halaman aman; override `max-h/overflow/border/shadow` modal; hapus dead rule. Dipakai juga oleh modal Reports (`print-area`, `print-card`) — aman, tidak mengubah perilaku inti.

**#8 — Nomor invoice rawan collision**  
Random 4-digit tanpa cek unique → risiko duplicate key saat data banyak.  
**Fix:** `generateUniqueInvoiceNumber()` — cek DB max 5x, fallback sisipkan timestamp.

### ⚪ LOW / BACKLOG (P2 — belum diubah)

- **#9** Table 7 kolom hanya `overflow-x-auto` di 375px — usable, tapi idealnya card-list mobile (pattern aplikasi ini di halaman lain).
- **#10** `confirm()` native untuk hapus — berfungsi di mobile tapi tidak konsisten dengan design system (ganti dialog custom).
- **#11** Tidak ada skeleton/empty-state khusus mobile; stats grid 2-kolom sudah responsive.
- **#12** PWA standalone: print & beberapa alur unduh tetap dibatasi iOS — rekomendasi produk: arahkan user ke browser, atau tambah "Share" via Web Share API untuk file.

---

## ✅ Validasi

**Test otomatis baru:** `scripts/playwright-invoice-mobile-test.mjs`

```bash
TEST_EMAIL=<akun PM/super_admin> TEST_PASSWORD=xxx BASE_URL=https://… \
  node scripts/playwright-invoice-mobile-test.mjs
```

Menguji di **iPhone 13 (390×844)** & **Pixel 7 (412×915)**, `hasTouch: true`:
1. Login & akses `/invoices`
2. Overflow horizontal halaman
3. Modal New Invoice: render, nomor auto-gen (`INV-YYYYMM-####`), **issue_date == hari ini lokal** (regresi timezone), line items, scrollability
4. Tombol Edit/Hapus/Download **visible tanpa hover** + bounding box ≥40px
5. PDF API: dummy UUID → ekspektasi **404** (authz OK), bukan 401/403
6. Screenshots → `scripts/screenshots/invoice-mobile/` + JSON hasil

**Validasi static:** `npx tsc --noEmit` → 0 error · `node --check` script → OK.

---

## 📦 File yang Diubah

| File | Perubahan |
|---|---|
| `src/app/(dashboard)/invoices/page.tsx` | Fix #1 #3 #4 #5 #8: tombol mobile-visible + touch target, blob download + toast, `localDateStr()`, unique invoice number |
| `src/app/api/invoices/[id]/pdf/route.ts` | Fix #2 #6: authz `canAccessRoute` sebelum service-role, filename sanitize + RFC 5987 |
| `src/app/globals.css` | Fix #7: konsolidasi print CSS, multi-halaman, hapus dead rule |
| `scripts/playwright-invoice-mobile-test.mjs` | **BARU** — regression test mobile invoice |
| `AUDIT-INVOICE-MOBILE.md` | **BARU** — laporan ini |

**Tidak ada perubahan skema database / migration.** Semua fix backward-compatible.

---

## 🎯 Kesimpulan Tim

> Generate invoice **kini aman & layak dipakai dari mobile**: buat, edit, hapus, lunas, unduh PDF — dengan error handling yang jelas. Keamanan PDF API ditutup (IDOR). Direkomendasikan menjalankan test mobile otomatis di CI untuk mencegah regresi touch/timezone.