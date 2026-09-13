/**
 * Verify migration-v111 (fix "relation content_plans does not exist" saat
 * hapus client) — TANPA akses SQL. Pola verify-v110: net-zero via REST.
 *
 * Catatan: jalur DDL otomatis (RPC exec_sql) ditutup sejak v99 → migration
 * dijalankan MANUAL di Supabase SQL Editor. Script ini memverifikasi hasil:
 *
 *   0. Sweep jejak run sebelumnya (marker notes)
 *   1. RPC get_client_dependencies → 200 (bukan 404 42P01)
 *   2. INSERT client test (tanpa dependensi) + DELETE → sukses (bukan 42P01)
 *      — v74 soft-delete trigger mengubah DELETE jadi UPDATE deleted_at,
 *        PostgREST balas 404 ketika 0 baris ter-hard-delete; makanya cek
 *        sesudahnya via GET: baris HILANG dari tampilan aktif = delete bekerja.
 *   3. Cleanup jejak (soft-delete by id)
 *
 * Usage: node scripts/verify-migration-v111.mjs
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY di .env.local');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const TEST_MARKER = '__v111_verify__';
const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';

console.log('=== VERIFY MIGRATION v111 (fix client delete 42P01) ===\n');

// ── 0. Sweep jejak run sebelumnya ──
const sweeRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?notes=eq.${TEST_MARKER}&deleted_at=is.null`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ deleted_at: new Date().toISOString() }),
});
check('0. Sweep jejak run sebelumnya', sweeRes.ok || sweeRes.status === 204, `HTTP ${sweeRes.status}`);

// ── 1. RPC get_client_dependencies → HARUS 200 (bukan 404 42P01) ──
const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_client_dependencies`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ p_client_id: DUMMY_UUID }),
});
if (rpcRes.ok) {
  const rows = await rpcRes.json();
  const names = Array.isArray(rows) ? rows.map((r) => `${r.table_name}:${r.row_count}`).join(', ') : '?';
  check('1. RPC get_client_dependencies jalan (bukan 42P01)', true, names);
} else {
  const errText = await rpcRes.text();
  check('1. RPC get_client_dependencies jalan (bukan 42P01)', false, `HTTP ${rpcRes.status}: ${errText.slice(0, 140)}`);
}

// ── 2. INSERT + DELETE client test → delete HARUS tanpa 42P01 ──
const insRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ name: `v111 verify ${Date.now()}`, notes: TEST_MARKER }),
});
if (!insRes.ok) {
  const errText = await insRes.text();
  check('2a. INSERT client test', false, `HTTP ${insRes.status}: ${errText.slice(0, 140)}`);
  console.error(failures === 0 ? '' : '\n❌ Hentikan: insert gagal.');
  process.exit(1);
}
const testClient = (await insRes.json())?.[0] || null;
check('2a. INSERT client test', !!testClient, `id ${testClient?.id?.slice(0, 8)}…`);

const delRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${testClient.id}&deleted_at=is.null`, {
  method: 'DELETE',
  headers: { ...headers, Prefer: 'return=minimal' },
});
const delBody = delRes.ok ? '' : await delRes.text();
// DELETE via REST: 204 (hard delete) ATAU 404 dari v74 soft-delete interceptor
// (beda dgn 42P01). Validasi sebenarnya = client HILANG dari tampilan aktif.
const notFound42 = delBody.includes('42P01');
check(
  '2b. DELETE client — TANPA error 42P01 content_plans',
  !notFound42 && (delRes.status === 204 || delRes.status === 404 || delRes.ok),
  `HTTP ${delRes.status}${delBody ? `: ${delBody.slice(0, 120)}` : ''}`
);

// ── 2c. Client test tidak lagi tampil sebagai aktif ──
const getRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${testClient.id}&deleted_at=is.null&select=id`, { headers });
const getRows = getRes.ok ? await getRes.json() : [];
check('2c. Client test hilang dari daftar aktif (delete bekerja)', Array.isArray(getRows) && getRows.length === 0, `${getRows.length} baris aktif tersisa`);

// ── 3. Cleanup net-zero: soft-delete jika masih aktif ──
if (getRows.length > 0) {
  const clRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${testClient.id}&deleted_at=is.null`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  check('3. Cleanup (soft-delete manual)', clRes.ok || clRes.status === 204, `HTTP ${clRes.status}`);
} else {
  check('3. Cleanup — sudah bersih', true);
}

console.log(failures === 0
  ? '\n✅ v111 aktif: hapus client berfungsi, proteksi dependensi & audit trail pulih.'
  : `\n❌ ${failures} check gagal — jalankan supabase/migration-v111-fix-client-delete-42p01.sql di Supabase SQL Editor lalu ulangi verify.`);
process.exit(failures === 0 ? 0 : 1);