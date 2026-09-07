# DEPLOY MIGRATION v108 — Security Hardening (Supabase Advisor) 🔴 URGENT

## Status

| Komponen | Status |
|---|---|
| `supabase/migration-v108-security-hardening.sql` | ✅ Siap (idempotent, aman diulang) |
| Verifikator `scripts/verify-migration-v108.mjs` | ✅ Siap (baseline 3 celah terkonfirmasi) |
| Eksekusi SQL ke produksi | 🔴 **URGENT — DB SEDANG RUSAK PARSIAL** |

## 🚨 Mengapa URGENT (bukan sekadar hardening)

Fix advisor "Function Search Path Mutable" yang sudah berjalan (parisal) di database
men-set `search_path = ''` pada banyak fungsi. Akibatnya fungsi yang memakai nama
tabel unqualified **kini ERROR** (`42P01 relation does not exist`), terkonfirmasi
via REST per 9 Jul 2026 jam 17:25:

| Fungsi | Status | Dampak dashboard |
|---|---|---|
| `get_chat_unread_total()` | ❌ RUSAK (42P01 `chat_messages`) | Badge unread chat tidak ter-update via RPC (silent-fail, tidak crash) |
| `get_user_divisions()` | ❌ RUSAK (42P01 `profiles`) | Tidak dipakai app/policy — dampak nol, tapi rusak |
| `is_manager()` | ⚠️ MENCURIGAKAN (anon 200 `false` — early-return menutupi error) | Dipakai banyak RLS policy — **wajib diperbaiki sebelum user login lain kena** |
| Trigger `handle_new_user`, `notify_*`, dst. | ❓ Tidak bisa dicek via REST | Berpotensi rusak juga (signup baru / notif gagal) |
| View `user_activity` | ✅ Sudah di-drop (baik) | Tidak dipakai app |

**Migration v108 adalah PENYEMBUHNYA**: pin ulang `search_path = 'public, extensions'`
di SEMUA fungsi public + menutup sisa celah advisor (anon exec, security_invoker view,
RLS schema_migrations).

## Langkah Eksekusi (±2 menit)

1. Buka **Supabase Dashboard** → project (yang dipakai app)
2. Menu **SQL Editor** → **New query**
3. Copy seluruh isi `supabase/migration-v108-security-hardening.sql` → paste → **Run**
4. Verifikasi otomatis:
   ```bash
   node scripts/verify-migration-v108.mjs
   ```
   Semua baris harus ✅ dan akhirnya:
   `✅ MIGRATION v108 DEPLOYED — hardening aktif, RPC aplikasi tidak terputus.`
5. Smoke test cepat di app: login → lonceng notif muncul angka chat → halaman Clients kebuka.

## Apa yang Dikerjakan v108

| Advisor finding | Fix |
|---|---|
| Function Search Path Mutable (34 fn) | `ALTER FUNCTION ... SET search_path = 'public, extensions'` (memulihkan fungsi rusak) |
| Exposed Auth Users + Definer View `user_activity` | `DROP VIEW` (sudah diverifikasi tidak dipakai app) |
| Security Definer View (2) | `security_invoker = true` (halaman Clients tetap jalan, fallback ada) |
| RLS Disabled `schema_migrations` | `ENABLE ROW LEVEL SECURITY` |
| Public Can Execute SECURITY DEFINER (21 fn) | `REVOKE EXECUTE FROM anon`; 4 RPC app tetap di-grant `authenticated` + `service_role` |
| `exec_sql` (jika ada) | Dikunci ke `service_role` saja |

## Sengaja TIDAK Disentuh (beserta alasan — jangan asal "fix" di advisor)

- **RLS Policy Always True (~40 tabel)** — desain workspace internal (otorisasi di
  middleware+UI). Mengubah = menu dashboard bisa kosong / data tak muncul (bug
  "save hilang" versi lebih parah). Butuh proyek RBAC tersendiri.
- **Multiple Permissive Policies** — kosmetik, backlog.
- **Public Bucket Allows Listing** — bucket logo/avatar memang public-read; tutup
  listing per-bucket nanti setelah dicek fitur file manager.
- **Extensions in Public** — pg_trgm/pg_net diperlukan app (search fuzzy, push relay).

## Rollback

Idempotent — aman dijalankan ulang. Rollback parsial:
```sql
-- kembalikan anon exec (TIDAK disarankan — membuka celah lama)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
-- unpin search_path
ALTER FUNCTION public.get_chat_unread_total() RESET search_path;
```

## Setting tambahan (manual, 30 detik)

**Leaked Password Protection** (advisor: Auth): Supabase Dashboard →
Authentication → Providers → Email → aktifkan **Leaked Password Protection**.
Tidak menyentuh kode — hanya menolak password yang ada di breach list.