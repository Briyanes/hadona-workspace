# Runbook: Migrasi Google Cloud (OAuth + Meet/Drive Integration)

> **Project GCP baru:** `hadona-workspace-507211` (ID: `280742273703`)
> **File credential:** `private-archive/client_secret_*.json` (sudah di-gitignore, jangan dipindah)
> **Helper:** `node scripts/extract-google-creds.mjs` (tampilkan nilai siap-copy + validasi redirect)

## Arsitektur 2 OAuth Client

| # | Client ID (awalan) | Peran | Redirect yang benar |
|---|---|---|---|
| 1 | `280742273703-qepapadqg5d...` | **Login Google** (via Supabase) | `https://<supabase-ref>.supabase.co/auth/v1/callback` + `https://workspace.hadona.id/auth/callback` |
| 2 | `280742273703-s7ftc3q34t...` | **Integrasi Meet/Drive** (API routes) | `https://workspace.hadona.id/api/google/callback` |

Kode referensi:
- Client 2 dipakai oleh `src/lib/google.ts` (redirect dihitung dari `GOOGLE_REDIRECT_URI` atau `NEXT_PUBLIC_APP_URL` + `/api/google/callback`)
- Token hasil OAuth client 2 disimpan di tabel `google_oauth_tokens`

## ⚠️ Masalah Saat Ini (wajib diperbaiki di GCP Console)

1. **Kedua redirect URI masih `http://`** → Google menolak/mismatch karena produksi jalan di `https://workspace.hadona.id`
2. **Client login belum punya callback Supabase** `https://<supabase-ref>.supabase.co/auth/v1/callback` → login Google pasti gagal tanpa ini
3. Project baru perlu enable **Google Calendar API** + **Google Drive API**, dan setup **OAuth consent screen**

---

## Langkah 1 — Perbaiki GCP Console (±10 menit)

Login ke [console.cloud.google.com](https://console.cloud.google.com) → pilih project `hadona-workspace-507211`.

### 1a. OAuth Consent Screen
- **APIs & Services → OAuth consent screen**
- User Type: External
- App name: `Hadona Workspace`, email support, developer contact
- **Scopes:** tambah `.../auth/calendar` (lihat catatan scope di bawah) dan `.../auth/drive.file`
- **Test users:** tambah akun Google semua user yang akan login/connect — ATAU klik **Publish app** agar semua orang bisa (verifikasi Google tidak wajib untuk scope ini)
- Simpan. Catat "Authorised domain": `hadona.id`

### 1b. Perbaiki Client 1 (login)
- **APIs & Services → Credentials** → klik client `...qepapadqg5d...`
- **Authorized redirect URIs**, pastikan berisi (hapus versi `http://`):
  - `https://<supabase-ref>.supabase.co/auth/v1/callback` ← **ganti `<supabase-ref>` dengan ref project Supabase Anda** (terlihat di Supabase Dashboard → Settings → General → Reference ID, atau dari `NEXT_PUBLIC_SUPABASE_URL`)
  - `https://workspace.hadona.id/auth/callback`
- Simpan

### 1c. Perbaiki Client 2 (integrasi Meet/Drive)
- Klik client `...s7ftc3q34t...`
- **Authorized redirect URIs**, hapus `http://`, ganti dengan:
  - `https://workspace.hadona.id/api/google/callback`
- Simpan

### 1d. Enable API
- **APIs & Services → Library** → enable:
  - **Google Calendar API** (dipakai untuk event + pembuatan link Meet via `conferenceData`)
  - **Google Drive API** (upload deliverable/creative)

### 1e. Re-download credential (opsional tapi disarankan)
- Download ulang kedua JSON → simpan di `private-archive/` (timpa file lama)
- Jalankan `node scripts/extract-google-creds.mjs` → pastikan **exit code 0** (semua validasi lolos)

## Langkah 2 — Supabase (client login)

1. [Supabase Dashboard](https://supabase.com/dashboard) → project Anda → **Authentication → Providers → Google**
2. Enable, lalu isi:
   - **Client ID** = client `...qepapadqg5d...`
   - **Client Secret** = secret-nya (lihat via `node scripts/extract-google-creds.mjs`)
3. **Authentication → URL Configuration:**
   - Site URL: `https://workspace.hadona.id`
   - Redirect URLs: tambah `https://workspace.hadona.id/auth/callback`

## Langkah 3 — Vercel (client integrasi)

1. Vercel → project → **Settings → Environment Variables** (Production):
   - `GOOGLE_CLIENT_ID` = `280742273703-s7ftc3q34tpj047g8qbko6blmvhpv98t.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET` = secret client 2
   - `GOOGLE_REDIRECT_URI` = `https://workspace.hadona.id/api/google/callback`
2. **Redeploy** agar env baru terbaca.

## Langkah 4 — Reset token lama (penting!)

Token OAuth yang tersimpan di DB dibuat dengan client lama → refresh token-nya otomatis invalid setelah ganti credential. Truncate:

```sql
TRUNCATE TABLE google_oauth_tokens;
```

Jalankan via Supabase SQL Editor. Semua user perlu re-connect di **Settings → Integrations**.

## Langkah 5 — Verifikasi

| Tes | Cara | Hasil yang diharapkan |
|---|---|---|
| Validasi credential lokal | `node scripts/extract-google-creds.mjs` | Exit 0, semua ✓ https |
| Login Google | Halaman login → tombol Google | Masuk ke dashboard tanpa error |
| Status integrasi | Settings → Integrations | Badge "Connected" untuk Calendar/Drive |
| Buat Meet | Task/chat → "Schedule meeting" / create meet | Link `meet.google.com/...` muncul |
| Upload Drive | Content Studio / Creative → upload deliverable | File muncul di Drive folder tujuan |

### Troubleshooting

- **`redirect_uri_mismatch`** → URI di GCP belum persis sama (perhatikan `https://`, trailing slash). Bandingkan dengan output script.
- **`invalid_client`** → Client ID/Secret tidak cocok antara Vercel ↔ GCP, atau project belum enable API terkait.
- **`access_blocked: app not verified`** → akun belum masuk Test users, atau app belum Publish.
- **401/invalid_grant saat sync** → Langkah 4 belum dijalankan; user harus re-connect.
- **Scope tidak muncul saat consent** → scope belum didaftarkan di consent screen (Langkah 1a).

---

## Catatan Scope

Kode meminta scope saat connect integrasi (lihat `src/lib/google.ts`). Pastikan scope berikut terdaftar di consent screen:
- `openid`, `email`, `profile` (login)
- `https://www.googleapis.com/auth/calendar` + pembuatan Meet via Calendar API `conferenceData` (integrasi)
- `https://www.googleapis.com/auth/drive.file` (upload — hanya file yang dibuat app)

## Kebersihan

- [ ] Hapus duplikat credential di `~/Downloads/client_secret_*.json`
- [ ] Pastikan `private-archive/` tetap di `.gitignore` (sudah ada, baris 46)
- [ ] Jangan pernah commit file credential — cek dengan `git status` sebelum commit