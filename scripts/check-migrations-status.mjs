/**
 * Cek status migration: bandingkan skema DB (via OpenAPI spec) dengan file migration lokal.
 * Read-only, tidak mengubah apa pun.
 */
import { readFileSync, readdirSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(`${SB_URL}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const spec = await res.json();
const defs = spec.definitions || {};
const tables = Object.keys(defs).sort();
console.log(`== TABLES/VIEWS di DB (${tables.length}) ==`);
console.log(tables.join(', '));

const show = (t) => {
  const d = defs[t];
  console.log(`\n== ${t} ==`);
  console.log(Object.keys((d && d.properties) || {}).join(', '));
};

for (const t of [
  'ads_content_clusters',
  'ads_creative_requests',
  'content_plans',
  'chat_channels',
  'chat_messages',
]) {
  if (defs[t]) show(t);
  else console.log(`\n== ${t} TIDAK ADA ==`);
}

// List file migration lokal untuk referensi urutan
const files = readdirSync('supabase')
  .filter((f) => /^migration-v\d+.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
console.log(`\n== FILE MIGRATION LOKAL (${files.length}) ==`);
console.log(files.join(', '));