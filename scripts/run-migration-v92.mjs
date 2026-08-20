/**
 * Run migration-v92.sql against Supabase database
 * Fix: chat_channels_type_check (add 'group') + RLS policies for groups/DMs
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function execSql(sql) {
  // Primary: exec_sql RPC
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

  // Fallback: pg/query endpoint
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
  const rawSql = readFileSync('supabase/migration-v92.sql', 'utf8');

  console.log('📋 Running migration-v92.sql (fix chat group constraint + RLS)...');
  console.log(`   SQL length: ${rawSql.length} chars\n`);

  // Strip single-line comments before parsing
  const cleanSql = rawSql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.substring(0, idx) : line;
    })
    .join('\n');

  // Split by semicolons (no dollar-quotes in this migration, but handle anyway)
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
    const preview = statements[i].substring(0, 70).replace(/\n/g, ' ');
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `);

    try {
      const result = await execSql(statements[i]);
      if (result.ok) {
        console.log('✅ OK');
        success++;
      } else if (String(result.error).includes('already exists')) {
        console.log('⚠️  Skipped (already exists)');
        success++;
      } else {
        console.log('❌ FAILED');
        console.log(`     ${String(result.error).substring(0, 250)}`);
        failed++;
      }
    } catch (err) {
      console.log('❌ ERROR');
      console.log(`     ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Migration complete: ${success} success, ${failed} failed`);
  if (failed > 0) {
    console.log('\n⚠️  Some statements failed. Run manually via Supabase Dashboard SQL Editor.');
    console.log('   File: supabase/migration-v92.sql');
    process.exit(1);
  }
}

runMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});