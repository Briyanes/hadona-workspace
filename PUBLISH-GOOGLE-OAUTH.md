# Panduan: Branding & Publish OAuth Consent Screen ke Production (Opsi B)

Dokumen ini adalah langkah manual di **Google Cloud Console** untuk:
1. Menyelesaikan branding aplikasi (agar consent screen tampil profesional)
2. Publish app ke **Production** — **WAJIB** agar refresh token Meet/Drive tidak expired setiap 7 hari

> Aplikasi: `workspace.hadona.id` • Project GCP: `HDN Advertising` (client baru hasil migrasi)

---

## A. Branding OAuth Consent Screen

1. Buka https://console.cloud.google.com/apis/credentials/consent
   - Pastikan project yang aktif = project GCP **baru** (HDN Advertising).
2. Tab **General** → edit:
   - **App name**: `Hadona Workspace`
   - **User support email**: email Anda (mis. lestari.okita@gmail.com)
   - **Application logo**: upload logo (bisa pakai `public/icon.png`, min 120×120 px)
   - **Application home page**: `https://workspace.hadona.id`
   - **Application privacy policy**: `https://workspace.hadona.id/privacy` ✅ *(halaman sudah dibuat & akan live setelah deploy)*
   - **Application terms of service**: `https://workspace.hadona.id/terms` ✅
   - **Authorized domains**: pastikan `hadona.id` terdaftar (Add domain jika belum)
3. Klik **Save** (perubahan logo/nama bisa makan waktu beberapa menit–jam untuk propagate).

## B. Publish ke Production (langkah penting!)

1. Masih di halaman OAuth consent screen → tab **Audience**.
2. Klik **PUBLISH APP** → konfirmasi.
3. Status akan berubah dari `Testing` menjadi **`In production`**.
4. **Biarkan User type = External.** Muncul warning "unverified app" saat user connect Google? Itu normal dan aman:
   - Karena hanya dipakai internal tim (< 100 user), tidak perlu verifikasi Google.
   - User tinggal klik **Advanced → Go to Hadona Workspace (unsafe)**.
   - (Opsional) Hilangkan warning sepenuhnya dengan verifikasi scope — tidak urgent.
5. Setelah publish: refresh token **tidak lagi expired 7 hari** ✅

## C. Verifikasi

1. Pastikan deploy Vercel terbaru sudah live (halaman `/privacy` & `/terms` aktif):
   - Buka https://workspace.hadona.id/privacy (tanpa login) — harus tampil Kebijakan Privasi.
2. Test ulang **Settings → Integrations → Connect Google**:
   - Consent screen akan tampil nama app + logo.
   - Warning "unverified" mungkin muncul pertama kali — lanjutkan via Advanced.
3. Test create meeting & upload Drive untuk memastikan token tersimpan.

## D. Catatan

- Teks "to continue to rsxqjjcuixdsmijhgdyl.supabase.co" pada **login** Google via Supabase **tetap ada** — itu domain callback Supabase Auth, normal untuk semua app Supabase. Yang berubah hanya layar consent flow Connect Google (Meet/Drive) yang menampilkan branding Hadona.
- Kalau suatu saat ingin "continue to auth.hadona.id", itu = Supabase Custom Domain (butuh plan Pro + DNS). Tidak urgent.
- Halaman `/privacy` & `/terms` baru: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, di-whitelist di `src/middleware.ts`.