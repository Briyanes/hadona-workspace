# DEPLOY MIGRATION v99 — Fix Drag-Drop Task Board (Bug Ovi)

## Status

| Komponen | Status |
|---|---|
| `supabase/migration-v99.sql` | ✅ Siap (helper `is_division_member` + policy UPDATE tasks) |
| Frontend fixes (`task-board.tsx`, `task-detail-modal.tsx` — 7 handler deteksi 0-row update) | ✅ Selesai, TSC + lint PASS |
| Eksekusi SQL ke produksi | ⏳ **MENUNGGU EKSEKUSI MANUAL** |

## Mengapa Manual

Semua jalur programmatic sudah dicoba dan gagal (diverifikasi 26/08/2026):

1. ❌ RPC `exec_sql` — tidak ada di schema cache (404). Kemungkinan pernah ada lalu dihapus — **celah keamanan yang sebaiknya tetap tertutup**.
2. ❌ `/pg/query` — endpoint sudah dihapus Supabase ("requested path is invalid").
3. ❌ Supabase CLI — access token di mesin ini milik akun lain (project `rsxqjjcuixdsmijhgdyl` tidak terdaftar).
4. ❌ Management API script (`run-migration-v99-mgmt.mjs`) — butuh SBP token owner.
5. ❌ `SUPABASE_DB_URL` — tidak diset di lingkungan mana pun.

## Langkah Eksekusi (±2 menit)

1. Buka **Supabase Dashboard** → project **`rsxqjjcuixdsmijhgdyl`**
2. Menu **SQL Editor** → **New query**
3. Copy seluruh isi `supabase/migration-v99.sql` → paste → **Run**
4. Verifikasi otomatis:
   ```bash
   node scripts/verify-migration-v99.mjs
   ```
   Harus output `✅ MIGRATION v99 DEPLOYED`.
5. Verifikasi behavioral (opsional tapi disarankan):
   ```bash
   node scripts/diagnose-drag-permission.mjs
   ```
   Login sebagai user divisi (mis. Creative Director) → drag card di task board → harus bertahan di kolom baru + toast jujur jika gagal.

## Apa yang Diperbaiki

**Root cause bug Ovi:** policy RLS `tasks_update_assignee_or_manager` hanya mengizinkan `created_by` / `is_manager()` / assignee. Anggota divisi lain mendapat **200 OK dengan 0 rows** dari PostgREST — bukan error — sehingga:

- Frontend menampilkan toast sukses palsu
- Realtime me-reset card ke posisi lama
- Tidak ada jejak error di console

**Fix DB (migration ini):**

- `is_division_member(p_division)` — helper yang menangani `profiles.division` bertipe TEXT maupun TEXT[]
- Policy UPDATE diperluas: anggota divisi task boleh update

**Fix frontend (sudah di codebase):**

- 7 handler update kini memakai `.select("id")` dan mendeteksi respons 0-row → toast error jujur, bukan sukses palsu

## Rollback

Migration ini idempotent (`CREATE OR REPLACE` + `DROP POLICY IF EXISTS` + `CREATE POLICY`). Untuk rollback penuh, jalankan:

```sql
DROP FUNCTION IF EXISTS public.is_division_member(TEXT);
DROP POLICY IF EXISTS tasks_update_assignee_or_manager ON public.tasks;
CREATE POLICY tasks_update_assignee_or_manager ON public.tasks
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR is_manager() OR assignee_id = auth.uid());