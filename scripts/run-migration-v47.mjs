import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', url);
console.log('Key prefix:', key?.slice(0, 20) + '...');

// Raw REST API call - tidak perlu exec_sql RPC function
const sql = `
ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sheet_source TEXT,
  ADD COLUMN IF NOT EXISTS sheet_gid TEXT;
`;

// Try via /pg/exec endpoint (Supabase v2 management API)
const res = await fetch(`${url}/pg/tables/weekly_reports`, {
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  },
});
console.log('Tables endpoint status:', res.status);
const text = await res.text();
console.log('Body:', text.slice(0, 500));

// Use supabase client to introspect columns
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await supabase
  .from('weekly_reports')
  .select('*')
  .limit(1);

if (error) {
  console.error('Select error:', error.message);
} else {
  console.log('Sample row columns:', data && data[0] ? Object.keys(data[0]).join(', ') : '(empty)');
}
