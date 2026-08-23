/**
 * Run migration-v97.sql against Supabase database
 * Kolom baru master publish: ad_status, funnel_stage, campaign_objective, prefilled_message
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

function splitStatements(cleanSql) {
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
      statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current);
  return statements;
}

async function runMigration() {
  const rawSql = readFileSync('supabase/migration-v97.sql', 'utf8');
  console.log('📋 Running migration-v97.sql (kolom master publish)...');

  const cleanSql = rawSql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.substring(0, idx) : line;
    })
    .join('\n');

  for (const stmt of splitStatements(cleanSql)) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    const { ok, error } = await execSql(trimmed);
    if (!ok) {
      console.error('❌ Statement gagal:', error);
      console.error('SQL:', trimmed.slice(0, 200));
      process.exit(1);
    }
  }

  console.log('✅ migration-v97.sql selesai diterapkan');
}

runMigration().catch((e) => {
  console.error('❌ Fatal:', e.message);
  process.exit(1);
});