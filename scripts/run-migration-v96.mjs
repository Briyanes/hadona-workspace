/**
 * Run migration-v96.sql against Supabase database
 * Perluas ads_content_clusters: kolom import Ads Creative per klien
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function execSql(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ sql_text: sql }),
  });
  if (res.ok) return { ok: true };
  const text = await res.text();

  const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (res2.ok) return { ok: true };
  const text2 = await res2.text();
  return { ok: false, error: text2 || text };
}

async function runMigration() {
  const rawSql = readFileSync('supabase/migration-v96.sql', 'utf8');
  console.log('📋 Running migration-v96.sql (expand ads_content_clusters)...');

  const cleanSql = rawSql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.substring(0, idx) : line;
    })
    .join('\n');

  const statements = [];
  let current = '';
  let inDollarQuote = false;
  for (let i = 0; i < cleanSql.length; i++) {
    current += cleanSql[i];
    if (cleanSql[i] === '$' && cleanSql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$';
      i++;
      continue;
    }
    if (cleanSql[i] === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
    }
  }
  if (current.trim()) statements.push(current.trim());

  console.log(`📝 Found ${statements.length} SQL statements\n`);

  let success = 0;
  let failed = 0;
  for (let i = 0; i < statements.length; i++) {
    const preview = statements[i].replace(/\s+/g, ' ').slice(0, 70);
    const result = await execSql(statements[i]);
    if (result.ok) {
      success++;
      console.log(`  ✅ [${i + 1}/${statements.length}] ${preview}...`);
    } else {
      failed++;
      console.log(`  ❌ [${i + 1}/${statements.length}] ${preview}...`);
      console.log(`     Error: ${result.error?.slice(0, 200)}`);
    }
  }

  console.log(`\n📊 Summary: ${success} success, ${failed} failed`);
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  });