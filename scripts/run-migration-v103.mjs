/**
 * Run migration-v103.sql against Supabase database
 * Push notification infrastructure:
 *   1. Tabel push_subscriptions + RLS
 *   2. RPC get_chat_unread_total (badge chat unread)
 *   3. Trigger pg_net → relay push (URL + secret di-inject dari env)
 *
 * Mengikuti pola run-migration-v102.mjs (RPC exec_sql → /pg/query fallback).
 * Bila kedua path gagal, jalankan manual isi supabase/migration-v103.sql
 * (dengan __RELAY_URL__/__RELAY_SECRET__ diganti manual) di Supabase SQL Editor.
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.hadona.id').replace(/\/$/, '');
const RELAY_SECRET = process.env.PUSH_RELAY_SECRET || process.env.CRON_SECRET || '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
if (!RELAY_SECRET) {
  console.error('Missing PUSH_RELAY_SECRET (fallback CRON_SECRET) — generate: openssl rand -hex 24');
  process.exit(1);
}

const RELAY_URL = `${APP_URL}/api/push/relay`;

let SQL = readFileSync(new URL('../supabase/migration-v103.sql', import.meta.url), 'utf8');
SQL = SQL.replaceAll('__RELAY_URL__', RELAY_URL).replaceAll('__RELAY_SECRET__', RELAY_SECRET);
console.log(`Relay URL : ${RELAY_URL}`);

async function execSql(sql) {
  // Path 1: RPC exec_sql
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

  return { ok: false, err: `${res.status} ${text}\n---\n${res2.status} ${text2}` };
}

console.log('Running migration v103...');
const result = await execSql(SQL);

if (result.ok) {
  console.log(`✅ Migration v103 OK via ${result.via}`);
  console.log('   - push_subscriptions table + RLS');
  console.log('   - get_chat_unread_total(uid) RPC');
  console.log(`   - pg_net trigger → ${RELAY_URL}`);
} else {
  console.error('❌ Migration v103 FAILED:');
  console.error(result.err);
  process.exit(1);
}