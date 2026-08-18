/**
 * Verify migration-v87.sql objects exist in Supabase database
 * Checks: 4 new tables, okrs new columns
 * (RLS policy listing needs pg_policies access — not available via PostgREST)
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY };

async function main() {
  console.log('🔍 Verifying migration-v87 objects...\n');
  let pass = 0;
  let fail = 0;

  function check(name, ok, detail = '') {
    if (ok) {
      console.log(`✅ ${name}`);
      pass++;
    } else {
      console.log(`❌ ${name} ${detail ? `— ${detail}` : ''}`);
      fail++;
    }
  }

  // 1. Tables exist (PostgREST select — 200/empty array if table exists, 404 if not)
  for (const t of ['client_social_accounts', 'client_competitors', 'client_principles', 'client_initiatives']) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=id&limit=1`, { headers });
      check(`Table ${t}`, res.ok, res.ok ? '' : `HTTP ${res.status}`);
    } catch (err) {
      check(`Table ${t}`, false, err.message);
    }
  }

  // 2. okrs new columns (select on missing column returns 400 "column does not exist")
  for (const col of ['kr_type', 'baseline_value', 'metric_name', 'last_checkin_at']) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/okrs?select=${col}&limit=1`, { headers });
      check(`Column okrs.${col}`, res.ok, res.ok ? '' : `HTTP ${res.status}`);
    } catch (err) {
      check(`Column okrs.${col}`, false, err.message);
    }
  }

  console.log('ℹ️  Note: RLS policies were created inside migration-v87.sql together with tables (idempotent script).');
  console.log('   If tables + columns above all pass, migration is applied. Optionally verify policies in Supabase Dashboard → Authentication → Policies.\n');

  console.log(`📊 Result: ${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.log('\n⚠️  Some objects missing. Re-run supabase/migration-v87.sql via Supabase SQL Editor.');
    process.exit(1);
  } else {
    console.log('🎉 Migration v87 verified — database ready!');
  }
}

main().catch((e) => {
  console.error('❌ Script error:', e.message);
  process.exit(1);
});