/**
 * Run migration-v99.sql via Supabase Management API
 * (exec_sql RPC tidak tersedia; gunakan /v1/projects/{ref}/database/query)
 *
 * Usage: node scripts/run-migration-v99-mgmt.mjs <SBP_TOKEN>
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const REF = SUPABASE_URL.replace('https://', '').split('.')[0];
// Token dari argv[2] (lebih andal; dotenvx bisa mengoverride process.env)
const TOKEN = process.argv[2] || process.env.SBP_TOKEN;

if (!SUPABASE_URL || !TOKEN) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL / token arg');
  process.exit(1);
}

const sql = readFileSync(new URL('../supabase/migration-v99.sql', import.meta.url), 'utf-8');

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${TOKEN}`,
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (!res.ok) {
  console.error('❌ GAGAL (' + res.status + '):', text.slice(0, 800));
  process.exit(1);
}
console.log('✅ migration-v99 sukses via Management API');
console.log(text.slice(0, 400));