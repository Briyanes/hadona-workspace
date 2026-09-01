/**
 * Run migration-v104.sql against Supabase database
 * Fix chat & mention notifications + configurable push relay:
 *   1. Jalankan supabase/migration-v104.sql (push_config + trigger fixed)
 *   2. Isi push_config (relay_url, relay_secret) via REST — secret TIDAK
 *      pernah ditulis ke file SQL
 *   3. Verifikasi: trigger ada, push_config terisi
 *
 * Mengikuti pola run-migration-v103.mjs (RPC exec_sql → /pg/query fallback).
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
const SQL = readFileSync(new URL('../supabase/migration-v104.sql', import.meta.url), 'utf8');

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

async function upsertPushConfig() {
  // Upsert relay_url + relay_secret via REST (Prefer: resolution=merge-duplicates)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_config?id=eq.true`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify({ relay_url: RELAY_URL, relay_secret: RELAY_SECRET, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`push_config upsert failed: ${res.status} ${text}`);
  }
  const rows = await res.json();
  const cfg = rows?.[0];
  return {
    url: cfg?.relay_url,
    secretSet: !!cfg?.relay_secret,
  };
}

async function verifyTriggers() {
  // Cek kedua trigger via RPC exec_sql (read-only query)
  const check = `
    select
      (select count(*) from pg_trigger where tgname = 'trg_notify_chat_members') as chat_trigger,
      (select count(*) from pg_trigger where tgname = 'trg_notifications_push_relay') as relay_trigger;
  `;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ sql_text: check }),
  });
  if (!res.ok) return { chat_trigger: '?', relay_trigger: '?' };
  const data = await res.json().catch(() => null);
  if (Array.isArray(data) && data[0]) return data[0];
  return { chat_trigger: '?', relay_trigger: '?' };
}

console.log(`Relay URL : ${RELAY_URL}`);
console.log('Running migration v104...');
const result = await execSql(SQL);

if (!result.ok) {
  console.error('❌ Migration v104 FAILED:');
  console.error(result.err);
  console.error('\nFallback: jalankan isi supabase/migration-v104.sql manual di Supabase SQL Editor,');
  console.error('lalu set push_config manual:');
  console.error(`  update push_config set relay_url = '${RELAY_URL}', relay_secret = '<SECRET>';`);
  process.exit(1);
}

console.log(`✅ Migration v104 SQL OK via ${result.via}`);

console.log('Upserting push_config via REST...');
try {
  const cfg = await upsertPushConfig();
  console.log(`✅ push_config: relay_url=${cfg.url} secret=${cfg.secretSet ? 'set ✓' : 'MISSING ✗'}`);
} catch (e) {
  console.error('❌', e.message);
  console.error('Set manual di SQL Editor:');
  console.error(`  update push_config set relay_url = '${RELAY_URL}', relay_secret = '<SECRET>';`);
  process.exit(1);
}

const t = await verifyTriggers();
console.log(`✅ Verify triggers: chat=${t.chat_trigger} relay=${t.relay_trigger} (harus >= 1)`);
console.log('\nDone. Notif chat/mention kini dibuat DB trigger + relay push otomatis.');