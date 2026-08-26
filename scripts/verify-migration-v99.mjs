/**
 * Verify migration-v99 deployment (tanpa akses SQL langsung).
 *
 * Cek 2 hal via REST:
 *   1. Function public.is_division_member terdaftar di schema cache
 *      (GET /rest/v1/ OpenAPI → /rpc/is_division_member)
 *   2. RPC callable: POST dengan service key → 200 (nilai boleh false
 *      karena service role tidak punya auth.uid()).
 *
 * Policy UPDATE tidak bisa dilihat via REST — verifikasi behavioral
 * dilakukan lewat playwright: drag task sebagai anggota divisi non-
 * manager non-assignee (lihat scripts/diagnose-drag-permission.mjs).
 *
 * Usage: node scripts/verify-migration-v99.mjs
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// --- Check 1: OpenAPI schema cache ---
const specRes = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
let fnListed = false;
if (specRes.ok) {
  const spec = await specRes.json();
  const paths = Object.keys(spec.paths || {});
  fnListed = paths.includes('/rpc/is_division_member');
} else {
  console.warn(`⚠️  OpenAPI fetch gagal: HTTP ${specRes.status}`);
}

// --- Check 2: RPC callable ---
const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_division_member`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_division: 'creative' }),
});
const rpcBody = await rpcRes.text();

console.log('=== VERIFY MIGRATION v99 ===');
console.log(`1. is_division_member di schema cache : ${fnListed ? '✅ TERDAFTAR' : '❌ TIDAK ADA'}`);
console.log(`2. RPC callable (HTTP)               : ${rpcRes.status === 200 ? '✅ 200' : `❌ HTTP ${rpcRes.status}`}`);
if (rpcRes.ok) {
  console.log(`   Return value (service role)       : ${rpcBody} (false wajar — tanpa auth.uid())`);
}

if (fnListed && rpcRes.ok) {
  console.log('\n✅ MIGRATION v99 DEPLOYED — function aktif.');
  console.log('   Policy UPDATE: verifikasi behavioral via diagnose-drag-permission.mjs / Playwright.');
  process.exit(0);
} else {
  console.log('\n❌ BELUM DEPLOYED.');
  console.log('   Jalankan isi supabase/migration-v99.sql di Supabase Dashboard →');
  console.log('   SQL Editor (project rsxqjjcuixdsmijhgdyl), lalu jalankan script ini lagi.');
  process.exit(1);
}