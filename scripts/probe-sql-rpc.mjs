/**
 * Probe: cari RPC yang bisa exec SQL di Supabase project ini
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

const candidates = ['exec_sql', 'run_sql', 'execute_sql', 'query', 'sql', 'exec', 'pg_query'];

for (const fn of candidates) {
  const bodyVariants = [
    { sql: 'SELECT 1 as t' },
    { sql_text: 'SELECT 1 as t' },
    { query: 'SELECT 1 as t' },
  ];
  for (const body of bodyVariants) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      console.log(`${res.ok ? '✅' : '❌'} rpc/${fn} ${JSON.stringify(body).slice(0, 40)} → ${res.status} ${text.slice(0, 120)}`);
      if (res.ok) {
        console.log(`\n🎉 FOUND: ${fn} with body keys ${Object.keys(body)}`);
        process.exit(0);
      }
    } catch (e) {
      console.log(`💥 rpc/${fn} → ${e.message}`);
    }
  }
}

// Cek juga pg/query langsung
try {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ query: 'SELECT 1 as t' }),
  });
  console.log(`pg/query → ${res.status} ${(await res.text()).slice(0, 120)}`);
} catch (e) {
  console.log(`pg/query → ${e.message}`);
}