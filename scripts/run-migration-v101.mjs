/**
 * Run migration-v101.sql against Supabase database
 * Trigger sinkronisasi Task Editor → Content Plan (arah balik done/undo-drag)
 *
 * Jalur DDL programatik kemungkinan terblokir (lihat DEPLOY-V99.md) —
 * bila kedua path gagal, jalankan manual isi supabase/migration-v101.sql
 * di Supabase SQL Editor (idempotent, aman diulang).
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SQL = readFileSync(new URL('../supabase/migration-v101.sql', import.meta.url), 'utf8');

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

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local');
    process.exit(1);
  }
  console.log('Menjalankan migration-v101 (trigger task→content_plan)…');
  const r = await execSql(SQL);
  if (r.ok) {
    console.log(`✅ Berhasil via ${r.via}`);
  } else {
    console.error('❌ Gagal kedua jalur programatik.');
    console.error('   exec_sql :', r.errRpc);
    console.error('   /pg/query:', r.errPg);
    console.error('\n→ Jalankan manual isi supabase/migration-v101.sql di Supabase SQL Editor.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});