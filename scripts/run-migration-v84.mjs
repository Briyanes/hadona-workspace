/**
 * Run migration-v84.sql against Supabase database
 * Adds Content Ads columns to content_uploads table
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  const rawSql = readFileSync('supabase/migration-v84.sql', 'utf8');

  console.log('📋 Running migration-v84.sql...');
  console.log(`   SQL length: ${rawSql.length} chars\n`);

  // Strip single-line comments (-- ...) before parsing
  const lines = rawSql.split('\n');
  const cleanLines = lines.map((line) => {
    const idx = line.indexOf('--');
    if (idx >= 0) {
      return line.substring(0, idx);
    }
    return line;
  });
  const cleanSql = cleanLines.join('\n');

  // Split by semicolons, respecting $$ dollar-quoted strings
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
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
    }
  }
  const lastTrimmed = current.trim();
  if (lastTrimmed) {
    statements.push(lastTrimmed);
  }

  console.log(`📝 Found ${statements.length} SQL statements\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}... `);

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ sql_text: stmt }),
      });

      if (!res.ok) {
        const text = await res.text();
        // Try pg/query endpoint as fallback
        const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
          },
          body: JSON.stringify({ query: stmt }),
        });

        if (!res2.ok) {
          const text2 = await res2.text();
          if (
            text2.includes('already exists') ||
            text2.includes('does not exist') ||
            text.includes('already exists')
          ) {
            console.log('⚠️  Skipped (already exists)');
            success++;
          } else {
            console.log('❌ FAILED');
            console.log(`     ${text2.substring(0, 200)}`);
            failed++;
          }
        } else {
          console.log('✅ OK');
          success++;
        }
      } else {
        console.log('✅ OK');
        success++;
      }
    } catch (err) {
      console.log('❌ ERROR');
      console.log(`     ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Migration complete: ${success} success, ${failed} failed`);

  if (failed > 0) {
    console.log('\n⚠️  Some statements failed. You may need to run this migration manually');
    console.log('   via the Supabase Dashboard SQL Editor.');
    console.log('   File: supabase/migration-v84.sql');
  }
}

runMigration().catch(console.error);