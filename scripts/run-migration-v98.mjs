/**
 * Run migration-v98.sql against Supabase database
 * Client delete protection + audit trail content_plans
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  return { ok: false, errRpc: text.slice(0, 300), errPg: text2.slice(0, 300) };
}

const sql = readFileSync(new URL('../supabase/migration-v98.sql', import.meta.url), 'utf-8');
const result = await execSql(sql);

if (result.ok) {
  console.log('✅ migration-v98 sukses via', result.via);
} else {
  console.error('❌ GAGAL via RPC:', result.errRpc);
  console.error('❌ GAGAL via /pg/query:', result.errPg);
  process.exit(1);
}