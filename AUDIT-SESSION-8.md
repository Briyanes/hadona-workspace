# AUDIT SESSION 8 — Content Plans, API Security & Data Layer

> Tanggal: 1 September 2026 · Scope: fitur content-plans (v101), task deliverables (v102), Google Cloud migration (OAuth/Drive/Meet), API security hardening

## 1. Ringkasan

| Aspek | Hasil |
|---|---|
| Perubahan kode | 2 file (28+/10−) |
| `tsc --noEmit` | ✅ EXIT 0 |
| `next lint` | ✅ 0 warning/error |
| Bug diperbaiki | 3 |
| Temuan terdokumentasi | 2 |

## 2. Fix yang Diterapkan

### FIX 1 — `normalizeDate()` gagal parse "Okt/Nov/Des" ✅
**File:** `src/lib/content-plan-sync.ts`

`new Date("15 Okt 2025")` mengembalikan `Invalid Date` (V8 tidak kenal singkatan Indonesia), sehingga baris content-plan dengan bulan Okt–Des gagal sinkron ke tasks.

**Solusi:** `MONTH_MAP` lookup (jan/feb/mar/…/des + fullname) → `new Date(d, m, y)` numerik. Ditambah guard `isValidDate` agar row invalid di-skip dengan log, bukan crash seluruh sync.

### FIX 2 — Route `POST /api/content-plans/import-sheet` tanpa auth guard ✅
**File:** `src/app/api/content-plans/import-sheet/route.ts`

Route membaca body dan (berpotensi) menulis data tanpa verifikasi session — hanya mengandalkan RLS.

**Solusi:** `supabase.auth.getUser()` di awal handler → 401 bila null. Konsisten dengan pola route import lain (`/api/import/sheet`, `/api/reports/import-sheet`).

### FIX 3 — CSRF bypass via `x-cron-secret` ✅
**File:** `src/lib/csrf.ts`

Verifikasi hanya cek **keberadaan** header, bukan **nilainya** — attacker bisa kirim header kosong/sembarang untuk bypass CSRF.

**Solusi:** bandingkan nilai header dengan `process.env.CRON_SECRET` via perbandingan konstan-waktu. Sumber pemanggilan (`/api/content-plans/import-sheet`) diverifikasi: header dikirim dengan nilai benar dari client.

## 3. Temuan (Tidak Diubah — Perlu Keputusan)

### FINDING A — RLS `task_deliverables` permissive (v102)
4 policy `USING (true)` / `WITH CHECK (true)` untuk semua `authenticated` → RLS efektif dekoratif; user terautentikasi mana pun bisa CRUD semua deliverable. **Konsisten** dengan pola `creative_deliverables` (v85), jadi tidak diubah sesi ini untuk hindari break flow upload Drive. **Rekomendasi:** scope ke `task assignee / division` di migration berikutnya.

### FINDING B — `reports/debug-me` selamat dari audit
Endpoint debug sudah triple-guarded: 404 di production + 401 tanpa session + 403 non-admin. Tidak perlu perubahan; bisa dihapus nanti.

## 4. Audit Frontend — Hydration
Semua `toLocaleDateString` adalah data-driven di client component (fetch post-mount), locale eksplisit `id-ID`, dan pola `"T00:00:00"` untuk date-only string sudah best-practice (mencegah timezone shift). **Tidak ada hydration mismatch berisiko.**

## 5. Tertunda (Blocked)
- **Playwright UI sweep (mobile 390px / desktop 1440px):** tidak bisa dijalankan — `TEST_LOGIN_EMAIL`/`TEST_LOGIN_PASSWORD` tidak ada di `.env.local`. Jalankan ulang setelah kredensial test tersedia.

## 6. Verifikasi
```
npx tsc --noEmit          → EXIT 0
npx next lint             → No ESLint warnings or errors