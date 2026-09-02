/**
 * Run migration-v106.sql against Supabase database
 * Notifikasi assignee saat status task berubah (review/blocked):
 *   1. Jalankan supabase/migration-v106.sql (rewrite trigger status)
 *   2. Verifikasi: fungsi + trigger terpasang
 *
 * Mengikuti pola run-migration-v104.mjs (RPC exec_sql → /pg/query fallback).
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const SQL = readFileSync(new URL('../supabase/migration-v106.sql', import.meta.url), 'utf8');

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function execSql(sql) {
  // Path 1: RPC exec_sql
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ sql_text: sql }),
  });
  if (res.ok) return { ok: true, via: 'rpc exec_sql' };
  const text = await res.text();

  // Path 2: /pg/query fallback
  const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: sql }),
  });
  if (res2.ok) return { ok: true, via: '/pg/query' };
  const text2 = await res2.text();

  return { ok: false, err: `${res.status} ${text}\n---\n${res2.status} ${text2}` };
}

async function verify() {
  // Cek trigger v106 aktif & trigger rusak v26 sudah bersih
  const check = `
    select
      (select count(*) from pg_trigger where tgname = 'trg_task_status') as trigger_v106,
      (select count(*) from pg_trigger where tgname = 'trg_notify_task_status') as trigger_v26_leftover,
      (select count(*) from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'notify_task_status_change') as fn_exists;
  `;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ sql_text: check }),
  });
  if (!res.ok) return { trigger_v106: '?', trigger_v26_leftover: '?', fn_exists: '?' };
  const data = await res.json().catch(() => null);
  if (Array.isArray(data) && data[0]) return data[0];
  return { trigger_v106: '?', trigger_v26_leftover: '?', fn_exists: '?' };
}

console.log('Running migration v106 (notif assignee saat status berubah)...');
const result = await execSql(SQL);

if (!result.ok) {
  console.error('❌ Migration v106 FAILED:');
  console.error(result.err);
  console.error('\nFallback: jalankan isi supabase/migration-v106.sql manual di Supabase SQL Editor.');
  process.exit(1);
}

console.log(`✅ Migration executed via ${result.via}`);
const v = await verify();
console.log('Verifikasi:', JSON.stringify(v));

if (v.trigger_v106 !== 1 || v.trigger_v26_leftover !== 0 || v.fn_exists !== 1) {
  console.error('❌ Verifikasi GAGAL — cek manual di Supabase SQL Editor:');
  console.error("  select tgname from pg_trigger where tgrelid = 'tasks'::regclass and not tgisinternal;");
  process.exit(1);
}

console.log('✅ Trigger trg_task_status aktif, sisa v26 bersih, fungsi terpasang.');
console.log('   → Task dipindah ke review/blocked kini memberi tahu semua assignee.');
console.log('   → Notif otomatis ter-kirim web push via relay (v104).');