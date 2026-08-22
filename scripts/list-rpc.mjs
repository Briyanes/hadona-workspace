/**
 * List semua RPC tersedia via PostgREST OpenAPI
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

console.log('URL:', URL);

const res = await fetch(`${URL}/rest/v1/`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const spec = await res.json();
const rpcs = Object.keys(spec.paths || {}).filter((p) => p.startsWith('/rpc/'));
console.log('Total paths:', Object.keys(spec.paths || {}).length);
console.log('RPC count:', rpcs.length);
for (const r of rpcs) console.log(' ', r);