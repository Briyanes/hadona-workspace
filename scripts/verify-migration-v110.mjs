/**
 * Verify migration-v110 (fix clients_slug_key duplicate) — TANPA akses SQL.
 * Pola verify-migration-v109.mjs: net-zero smoke test via REST PostgREST.
 *
 * Catatan: jalur DDL otomatis (RPC exec_sql) sudah ditutup sejak v99
 * (security hardening) → migration SQL harus dijalankan MANUAL di Supabase
 * SQL Editor. Script ini memverifikasi hasilnya:
 *
 *   1. Ambil 1 client existing (nama + slug asli)
 *   2. INSERT client duplikat (nama & slug sama persis) via service_role
 *      → v110 trigger HARUS meng-auto-suffix slug (201 + slug berubah),
 *        bukan 409 duplicate key
 *   3. UPDATE nama client test → nama existing (rename bentrok diri)
 *      → tetap sukses (exclude NEW.id)
 *   4. Cleanup client test via SOFT-DELETE (PATCH deleted_at) — hard DELETE
 *      diblokir trigger proteksi v74/v98 (PostgREST balas 404). Soft-deleted
 *      client tidak tampil di UI mana pun = net-zero secara aplikasi.
 *      Plus: bersihkan sisa jejak run sebelumnya (notes = marker).
 *
 * Usage: node scripts/verify-migration-v110.mjs
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

const TEST_MARKER = '__v110_verify__';

console.log('=== VERIFY MIGRATION v110 (clients slug unique) ===\n');

// ── 0a. Bersihkan jejak run sebelumnya (run gagal di tengah, dsb.) ──
const sweeRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?notes=eq.${TEST_MARKER}&deleted_at=is.null`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ deleted_at: new Date().toISOString() }),
});
check('0. Sweep jejak run sebelumnya (soft-delete sisa marker)', sweeRes.ok || sweeRes.status === 204, `HTTP ${sweeRes.status}`);

// ── 0b. Pastikan ada client existing untuk dijadikan "korban" duplikasi ──
const listRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?select=id,name,slug&order=name&limit=1`, { headers });
const list = listRes.ok ? await listRes.json() : [];
if (!listRes.ok || !list.length) {
  console.error('❌ Tidak bisa mengambil sample client (table clients kosong/bermasalah).');
  process.exit(1);
}
const sample = list[0];
console.log(`Sample client: "${sample.name}" (slug: ${sample.slug})\n`);

// ── 1. INSERT duplikat nama+slug → HARUS 201 dengan slug ter-suffix ──
const insRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: sample.name,
    slug: sample.slug, // bentrok sengaja — trigger v110 harus auto-suffix
    notes: TEST_MARKER,
  }),
});
let testClient = null;
if (insRes.ok) {
  testClient = (await insRes.json())?.[0] || null;
  const gotSlug = testClient?.slug || '';
  const suffixed = gotSlug !== sample.slug && gotSlug.startsWith(sample.slug);
  check('1. INSERT slug duplikat → 201 + auto-suffix (bukan 409)', !!testClient && suffixed, `slug jadi "${gotSlug}"`);
} else {
  const errText = await insRes.text();
  check('1. INSERT slug duplikat → 201 + auto-suffix (bukan 409)', false, `HTTP ${insRes.status}: ${errText.slice(0, 160)}`);
  if (insRes.status === 409) {
    console.error('\n→ Trigger v110 BELUM terpasang. Jalankan MANUAL di Supabase SQL Editor:');
    console.error('   supabase/migration-v110-fix-clients-slug-unique.sql');
  }
}

// ── 2. UPDATE rename ke nama existing → HARUS 204 (exclude diri) ──
if (testClient) {
  const updRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${testClient.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: sample.name, slug: sample.slug }),
  });
  check('2. UPDATE rename bentrok → sukses (tidak 409)', updRes.ok || updRes.status === 204, `HTTP ${updRes.status}`);
}

// ── 3. Net-zero cleanup: soft-delete client test (hard DELETE diblokir v74/v98) ──
if (testClient) {
  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/clients?id=eq.${testClient.id}&deleted_at=is.null`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
  check('3. Cleanup client test — soft-delete (net-zero)', delRes.ok || delRes.status === 204, `HTTP ${delRes.status}`);
}

console.log(failures === 0
  ? '\n✅ v110 aktif: insert/update client tidak mungkin 23505 slug lagi.'
  : `\n❌ ${failures} check gagal — jalankan supabase/migration-v110-fix-clients-slug-unique.sql di Supabase SQL Editor lalu ulangi verify.`);
process.exit(failures === 0 ? 0 : 1);