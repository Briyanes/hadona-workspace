# AUDIT SESSION 9 — UI/UX Konsistensi + Backend Security Sweep

**Tanggal:** 1 September 2026
**Scope:** Baseline health check, static audit font/komponen, backend API auth sweep
**Status:** ✅ Selesai (audit + 1 fix security kritikal)

---

## Ringkasan Eksekutif

| Area | Hasil |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ 0 error |
| ESLint (`next lint`) | ✅ 0 warning/error |
| API auth guard sweep (58 routes) | 🔴 1 kritikal → **FIXED** |
| Font-size off-scale | ⚠️ ±20 lokasi `text-[8px]/[9px]` (badge mikro) — tercatat, low risk |
| Font-size inkonsisten | ⚠️ 33× `text-[11px]` vs 316× `text-[10px]` — tercatat |

---

## 1. Fix yang Diimplementasi

### 🔴 [FIXED] `/api/calendar/create-task` — Service Role tanpa Auth Guard

**Risiko:** Route `POST /api/calendar/create-task` memakai `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS) **tanpa verifikasi session**. Siapa pun (anonymous) yang bisa menebak URL bisa:
- Membuat task arbitrer
- Meng-assign task ke user mana pun
- Mengirim notifikasi ke user mana pun
- Men-spoofing kolom `created_by` dengan UUID palsu

**Perbaikan (`src/app/api/calendar/create-task/route.ts`):**
1. Tambah `getAuthenticatedUser(req)` guard di awal handler → return `401 Unauthorized` jika tidak ada session valid.
2. Kolom `created_by` **selalu** di-set server-side dari `auth.user.id` — input klien diabaikan (anti-spoofing).
3. Import `@/lib/auth-api` mengikuti pola route lain (`/api/dashboard`, `/api/dashboard/ae-analytics`).

**Verifikasi:**
- `tsc --noEmit` ✅ exit 0
- Caller tunggal = `src/app/(dashboard)/calendar/page.tsx` (halaman behind auth middleware, cookies selalu terkirim) → **tidak ada breaking flow**

---

## 2. Backend Auth Sweep (58 API routes)

Hasil scan seluruh `src/app/api/**/route.ts`:

| Route | Status | Catatan |
|---|---|---|
| `calendar/create-task` | 🔴→✅ FIXED | Service role tanpa guard (lihat di atas) |
| `reports/public` | ✅ By-design | Public token + rate limit 60req/5min/IP |
| `debug/ads-spend` | ✅ Aman | Ada cek Bearer/cookie → 401 |
| `reports/debug-me` | ⚠️ Low | Hanya baca data sendiri; kandidat dihapus saat production cleanup |
| `dashboard`, `dashboard/ae-analytics`, `import/strategy-sheet` | ✅ Aman | `getAuthenticatedUser` (false positive grep awal) |
| Semua `cron/*` | ✅ Aman | Dilindungi `lib/cron-auth.ts` |

---

## 3. Temuan UI (Tercatat — Belum Difix)

### 3.1 Font off-scale `text-[8px]` / `text-[9px]` (±20 lokasi)
Mayoritas badge mikro & label kecil. Distribusi:
- `calendar/page.tsx` — 9 lokasi (badge overlap event, label mobile)
- `clients/page.tsx` + `clients/[id]/page.tsx` — 5 lokasi (badge counter, avatar initial)
- `reports/page.tsx` — 4 lokasi (hint import parser)
- `leads/page.tsx`, `brand-kits/page.tsx` — 4 lokasi

**Rekomendasi:** Standardisasi floor minimum `text-[9px]` (ganti `text-[8px]`), atau naikkan semua mikro-badge ke `text-[10px]` bila layout allows. Prioritas rendah — visual saja, tidak breaking.

### 3.2 Inkonsistensi `text-[11px]` (33×) vs `text-[10px]` (316×)
Skala de-facto project adalah `10px` untuk teks terkecil. `text-[11px]` tersebar sebagai anomali.

**Rekomendasi:** Batch replace `text-[11px]` → `text-[10px]` di sprint cleanup berikutnya.

---

## 4. Baseline Health

```
TSC:  0 errors
LINT: 0 warnings, 0 errors
Routes: 58 total, semua terverifikasi auth statusnya
```

---

## 5. Next Steps (Backlog)

1. **P0 — Deploy fix create-task** (sudah aman lokal, perlu push + deploy Vercel)
2. **P1** — Hapus `reports/debug-me` setelah tidak dipakai QA
3. **P2** — Font normalization pass (`text-[8px]`→`[9px]`, `text-[11px]`→`[10px]`)
4. **P2** — Lanjutkan audit Playwright mobile/desktop per grup menu (batch 1-7) yang tertunda