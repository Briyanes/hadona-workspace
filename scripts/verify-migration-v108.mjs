/**
 * Verify migration-v108 (security hardening) deployment — TANPA akses SQL.
 * Pola verify-migration-v99.mjs: semua cek via REST PostgREST.
 *
 * Cek via REST:
 *   1. View user_activity HILANG dari REST (404 = sudah di-drop)
 *   2. View client_financial_summary tetap terbaca service_role & authenticated
 *      (perubahan security_invoker tidak memutus halaman Clients)
 *   3. anon DIBLOKIR exec SECURITY DEFINER (is_manager → bukan 200)
 *   4. authenticated MASIH BISA get_chat_unread_total (badge notif chat)
 *   5. service_role MASIH BISA get_chat_unread_total + increment_view_count*
 *   6. exec_sql tetap tidak diekspos (sudah oke sejak v99 — regress guard)
 *
 * *increment_view_count tidak dipanggil langsung (butuh token valid); cukup
 *  pastikan tidak 404-not-in-cache saat service_role memanggil — dipakai
 *  API route /api/reports/public.
 *
 * Prasyarat: TEST_EMAIL / TEST_PASSWORD di .env.local (user login biasa).
 * Usage: node scripts/verify-migration-v108.mjs
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / ANON / SERVICE_ROLE key');
  process.exit(1);
}

const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};
const anonHeaders = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
};

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

console.log('=== VERIFY MIGRATION v108 (security hardening) ===\n');

// ── 1. user_activity hilang dari REST ─────────────────────────────
const ua = await fetch(`${SUPABASE_URL}/rest/v1/user_activity?select=*&limit=1`, { headers: svcHeaders });
check('A3: view user_activity tidak lagi diekspos REST', ua.status === 404, `HTTP ${ua.status}`);

// ── 2a. client_financial_summary tetap terbaca service_role ──────
const cfsSvc = await fetch(`${SUPABASE_URL}/rest/v1/client_financial_summary?select=*&limit=1`, { headers: svcHeaders });
check('A2: client_financial_summary (service_role) tetap terbaca', cfsSvc.status === 200, `HTTP ${cfsSvc.status}`);

// ── Login user biasa untuk cek authenticated ──────────────────────
let userToken = null;
if (TEST_EMAIL && TEST_PASSWORD) {
  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (login.ok) {
    const { access_token } = await login.json();
    userToken = access_token;
  } else {
    console.log(`⚠️  Login TEST_EMAIL gagal (HTTP ${login.status}) — cek authenticated dilewati`);
  }
} else {
  console.log('⚠️  TEST_EMAIL/TEST_PASSWORD tidak diset — cek authenticated dilewati');
}

if (userToken) {
  const authHeaders = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${userToken}`,
  };
  // 2b. view tetap terbaca oleh user login (halaman Clients)
  const cfsAuth = await fetch(`${SUPABASE_URL}/rest/v1/client_financial_summary?select=*&limit=1`, { headers: authHeaders });
  check('A2: client_financial_summary (authenticated) tetap terbaca', cfsAuth.status === 200, `HTTP ${cfsAuth.status}`);

  // 4. badge notif chat tetap jalan
  const chat = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_chat_unread_total`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('B1: get_chat_unread_total (authenticated) tetap 200', chat.status === 200, `HTTP ${chat.status}`);
}

// ── 3. anon diblokir exec SECURITY DEFINER ────────────────────────
const anonMgr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_manager`, {
  method: 'POST',
  headers: anonHeaders,
  body: '{}',
});
check('B1: anon DIBLOKIR is_manager (bukan 200)', anonMgr.status !== 200, `HTTP ${anonMgr.status}`);

const anonPurge = await fetch(`${SUPABASE_URL}/rest/v1/rpc/purge_soft_deleted`, {
  method: 'POST',
  headers: anonHeaders,
  body: '{}',
});
check('B1: anon DIBLOKIR purge_soft_deleted (bukan 200)', anonPurge.status !== 200, `HTTP ${anonPurge.status}`);

// ── 5. service_role tetap bisa RPC yang dipakai app ───────────────
const svcChat = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_chat_unread_total`, {
  method: 'POST',
  headers: { ...svcHeaders, 'Content-Type': 'application/json' },
  body: '{}',
});
check('B1: get_chat_unread_total (service_role) tetap 200', svcChat.status === 200, `HTTP ${svcChat.status}`);

// increment_view_count: cukup pastikan masih ada di schema cache & callable.
// CATATAN: 42P01 "relation shared_reports does not exist" = error di DALAM
// fungsi (fitur shared report memang belum lengkap, pre-existing) — fungsi
// sendiri tetap granted & callable. Yang gagal = PGRST202 (schema cache).
const svcView = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_view_count`, {
  method: 'POST',
  headers: { ...svcHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ token_input: 'x'.repeat(40) }),
});
const svcViewBody = await svcView.json().catch(() => ({}));
const viewCallable = !(svcView.status === 404 && svcViewBody?.code === 'PGRST202');
check(
  'B1: increment_view_count (service_role) callable',
  viewCallable,
  `HTTP ${svcView.status}${svcViewBody?.code ? ` ${svcViewBody.code}` : ''}${svcViewBody?.code === '42P01' ? ' (pre-existing: tabel shared_reports belum ada)' : ''}`
);

// ── 6. exec_sql tetap tidak diekspos (guard regresi v99) ──────────
const specRes = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: svcHeaders });
if (specRes.ok) {
  const spec = await specRes.json();
  const paths = Object.keys(spec.paths || {});
  check('B1: exec_sql TIDAK diekspos di REST (regress guard v99)', !paths.includes('/rpc/exec_sql'));
} else {
  console.log(`⚠️  OpenAPI fetch gagal (HTTP ${specRes.status}) — cek exec_sql dilewati`);
}

// Diagnosa tambahan: 42P01 dari RPC = tabel tidak resolve DI DALAM fungsi
// (search_path kosong — efek samping fix advisor parsial). v108 MEMULIHKAN
// dengan search_path = 'public, extensions'.
if (svcChat.status !== 200) {
  const chatBody = await svcChat.json().catch(() => ({}));
  if (chatBody?.code === '42P01') {
    console.log('\n🚨 DIAGNOSA: get_chat_unread_total RUSAK (42P01, search_path kosong).');
    console.log('   v108 akan memulihkannya.');
  }
}

// ── Kesimpulan ────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n❌ ${failures} cek GAGAL — migration v108 kemungkinan BELUM dijalankan di SQL Editor.`);
  console.error('   Jalankan supabase/migration-v108-security-hardening.sql manual (lihat DEPLOY-V108.md).');
  process.exit(1);
}
console.log('\n✅ MIGRATION v108 DEPLOYED — hardening aktif, RPC aplikasi tidak terputus.');