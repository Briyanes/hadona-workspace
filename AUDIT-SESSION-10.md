# AUDIT SESSION 10 — Post Google Cloud Migration Health Check

**Tanggal:** 1 Sept 2026 · **Scope:** Static analysis, security review, config readiness Google Cloud

---

## Ringkasan Eksekutif

| Area | Status |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ PASS |
| ESLint (`src/**`) | ✅ PASS (0 error) |
| Production build (`next build`) | ✅ PASS (exit 0) |
| Google OAuth env vars | 🔴 **MISSING** |
| File credential `private-archive/` | 🔴 **KOSONG** |
| Upload route logic | 🟡 1 kontradiksi whitelist SVG |
| Delete route ownership | 🟡 gap folder non-tracked |
| CSRF / XSS / Sanitasi | ✅ Solid |

**Kesimpulan:** Kode sehat dan siap deploy, tetapi **migrasi Google Cloud belum selesai dieksekusi** — tanpa creds, semua fitur Google (Login via Supabase, Create Meeting, Upload to Drive, Calendar sync) akan error di runtime.

---

## 🔴 KRITIS — Konfigurasi Google Belum Ada

### Temuan 1: `.env.local` tidak memuat variabel Google
Key yang ada: `CRON_SECRET, META_APP_ID, META_APP_SECRET, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_*, R2_*, SUPABASE_SERVICE_ROLE_KEY`.

Key yang **hilang** (dibutuhkan `src/lib/google.ts`):
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI   (opsional, fallback NEXT_PUBLIC_APP_URL + /api/google/callback)
```
**Dampak runtime:** `getGoogleOAuthConfig()` throw `"Google OAuth credentials not configured"` → `/api/google/auth`, `/api/google/create-meet`, `/api/google/drive/*`, `/api/google/callback` semuanya 500/400.

### Temuan 2: `private-archive/` tidak berisi `client_secret_*.json`
`node scripts/extract-google-creds.mjs --mask` → `✗ Tidak ada file client_secret_*.json`.
Runbook `MIGRATE-GOOGLE-CLOUD.md` menyebut 2 OAuth client (login via Supabase + integrasi Meet/Drive) di project GCP `hadona-workspace-507211` (ID `280742273703`) — file JSON-nya harus diunduh ulang dari GCP Console → Credentials → masing-masing client → "Download JSON", taruh di `private-archive/`.

### Checklist penyelesaian (mengikuti runbook)
1. GCP Console → OAuth consent screen: External, app `Hadona Workspace`, scope `calendar` + `drive.file`, test users / Publish app.
2. Client login (`...qepapadqg5d...`): redirect `https://<supabase-ref>.supabase.co/auth/v1/callback` + `https://workspace.hadona.id/auth/callback` (wajib `https://`, hapus `http://`).
3. Client integrasi (`...s7ftc3q34t...`): redirect `https://workspace.hadona.id/api/google/callback`.
4. Enable **Google Calendar API** + **Google Drive API** di project baru.
5. Unduh 2 JSON → `private-archive/` → `node scripts/extract-google-creds.mjs` → copy nilai ke Vercel env (+ `.env.local` untuk dev).
6. Supabase Dashboard → Auth → Providers → Google: isi Client ID/SECRET **client 1** (bukan client 2).
7. Redeploy → verifikasi `/settings/integrations` → Connect Google → sukses.

---

## 🟡 BUG LOGIKA — `src/app/api/upload/route.ts`

### Temuan 3: Whitelist SVG kontradiktif (dead config)
`ALLOWED_MIME_TYPES` mengizinkan `image/svg+xml` untuk `client-attachments`, `creative-assets`, `client-logos`, `uploads` — tetapi `BLOCKED_EXTENSIONS` memblokir `.svg` (komentar: XSS via script tag). **Hasil net:** upload SVG selalu ditolak 415 meski "diizinkan" — whitelist menyesatkan, pesan error membingungkan user.
**Fix disarankan:** hapus `image/svg+xml` dari semua `ALLOWED_MIME_TYPES` (pilihan aman — file dilayani publik dari R2 tanpa CSP header), ATAU jika logo SVG memang wajib: sanitasi server-side (strip `<script>`) + header `Content-Security-Policy: default-src 'none'` di R2/CDN untuk `.svg`.

### Temuan 4: Delete route — ownership gap folder non-tracked
`src/app/api/delete/route.ts` mengecek ownership hanya bila file ada di `file_attachments` ATAU folder termasuk `selfServiceFolders` (`avatar-assets`, `client-logos`). File di folder lain yang tidak tercatat di DB (mis. `creative-assets/xyz.mp4` orphan) **bisa dihapus user login mana pun**.
**Fix disarankan:** untuk folder non-self-service tanpa record DB → tolak (403/404) kecuali admin, karena tidak ada cara memverifikasi kepemilikan.

---

## ✅ YANG SUDAH BAIK

- **CSRF** (`src/lib/csrf.ts`): fail-closed; cron secret diverifikasi nilainya (bukan sekadar keberadaan header); origin + referer + same-host check lengkap.
- **Middleware**: proteksi rapi (embed/shared token-based, legal pages utk OAuth consent, metadata publik, approval-flow redirect, division guard). `/api/*` sengaja dilewati ke handler masing-masing (semua route memang cek `auth.getUser()` sendiri — terverifikasi di upload/delete).
- **Upload route**: rate-limit, MIME whitelist, path-traversal sanitasi, dua mode (presigned + relay 4MB) — selain isu SVG di atas.
- **XSS**: `rich-text.tsx` render React nodes tanpa `dangerouslySetInnerHTML`; `sanitize.ts` strip tag server-side; 2 lokasi `dangerouslySetInnerHTML` hanyalah layout.tsx (JSON-LD statis) dan rich-text fallback yang ter-escape.
- **Delete route**: rate-limit + ownership + admin override (selain gap Temuan 4).
- **Build**: semua 40+ route ter-compile, middleware 86 kB, tidak ada page error.

---

## ⚠️ CATATAN PEMBATASAN AUDIT

- **Responsive sweep (desktop/tablet/mobile) TIDAK dieksekusi** sesi ini — memerlukan dev server + kredensial QA login yang tidak tersedia saat ini. Jalankan ulang bila perlu:
  ```bash
  npm run dev
  node scripts/playwright-mobile-sweep.mjs
  node scripts/playwright-deep-qa.mjs
  ```
- `toLocaleDateString` dipakai di 5 file (embed, shared, invoice PDF, contract-renewal cron, clients) — potensi timezone-mismatch server (Vercel UTC) vs user (UTC+7) untuk label tanggal; tidak fatal, tapi pertimbangkan `Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta" })`.

---

## Rekomendasi Prioritas

| # | Aksi | Effort |
|---|---|---|
| 1 | Eksekusi checklist GCP (creds + redirect + APIs + Supabase provider) | 30 menit |
| 2 | Set env Google di Vercel & `.env.local` | 5 menit |
| 3 | Rapikan whitelist SVG di upload route | 10 menit |
| 4 | Tutup ownership gap delete route | 15 menit |
| 5 | Uji runtime: connect Google → create meeting → upload Drive | 15 menit |
| 6 | Normalisasi timezone format tanggal | backlog |