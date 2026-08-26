/**
 * Run migration-v99.sql against Supabase database
 * Fix RLS tasks UPDATE — anggota divisi boleh update task divisinya.
 * (Bug: drag task board gagal diam-diam untuk non-manager non-assignee)
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function execSql(sql) {
  // Path 1: RPC exec_sql (param sql_text) — pola yang dipakai migrasi sebelumnya
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ sql_text: sql }),
  });
  if (res.ok) return { ok: true, via: 'rpc exec_sql' };
  const text = await res.text();

  // Path 2: /pg/query fallback
  const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res2.ok) return { ok: true, via: '/pg/query' };
  const text2 = await res2.text();

  return { ok: false, errRpc: text.slice(0, 500), errPg: text2.slice(0, 500) };
}

const sql = readFileSync(new URL('../supabase/migration-v99.sql', import.meta.url), 'utf-8');
const result = await execSql(sql);

if (result.ok) {
  console.log('✅ migration-v99 sukses via', result.via);
} else {
  console.error('❌ GAGAL via RPC:', result.errRpc);
  console.error('❌ GAGAL via /pg/query:', result.errPg);
  process.exit(1);
}

// Verifikasi: policy baru harus mengandung is_division_member
const verify = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SERVICE_KEY}`,
    apikey: SERVICE_KEY,
  },
  body: JSON.stringify({
    sql_text:
      "SELECT policyname, qual FROM pg_policies WHERE tablename='tasks' AND cmd='UPDATE';",
  }),
});
if (verify.ok) {
  const policies = await verify.json();
  const updated = Array.isArray(policies)
    ? policies.find((p) => JSON.stringify(p).includes('is_division_member'))
    : null;
  console.log(
    updated
      ? '✅ Verifikasi: policy UPDATE tasks sudah memuat is_division_member'
      : '⚠️ Policy diperbarui tapi is_division_member tidak terdeteksi — cek manual pg_policies'
  );
} else {
  console.log('⚠️ Verifikasi pg_policies tidak tersedia — cek manual di Supabase Studio');
}
