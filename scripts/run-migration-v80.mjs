/**
 * Run migration-v80.sql against Supabase database
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runMigration() {
  const sql = readFileSync('supabase/migration-v80.sql', 'utf8');

  console.log('📋 Running migration-v80.sql...');
  console.log(`   SQL length: ${sql.length} chars\n`);

  // The /pg/query endpoint doesn't support multi-statement, so split by semicolons
  // and run each statement individually. Skip DO $$ ... $$ blocks specially.
  const statements = [];
  let current = '';
  let inDollarQuote = false;

  for (let i = 0; i < sql.length; i++) {
    current += sql[i];

    // Track $$ dollar-quoted strings
    if (sql[i] === '$' && sql[i + 1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$';
      i++; // skip next $
      continue;
    }

    if (sql[i] === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 1 && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      current = '';
    }
  }
  if (current.trim().length > 1) statements.push(current.trim());

  console.log(`   Parsed ${statements.length} statements\n`);

  let success = 0;
  let errors = 0;

  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx];
    // Skip pure comment lines
    const firstLine = stmt.split('\n')[0];
    if (firstLine.trim().startsWith('--')) {
      continue;
    }

    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          apikey: SERVICE_KEY,
        },
        body: JSON.stringify({ sql: stmt }),
      });

      if (resp.ok) {
        success++;
      } else if (resp.status === 404) {
        // exec_sql function doesn't exist, use pg/query
        break;
      } else {
        const text = await resp.text();
        // Ignore "already exists" errors
        if (text.includes('already exists') || text.includes('duplicate')) {
          success++;
        } else {
          errors++;
          console.error(`  ⚠️ Statement ${idx + 1}: ${text.substring(0, 200)}`);
        }
      }
    } catch (err) {
      errors++;
      console.error(`  ❌ Statement ${idx + 1}: ${err.message}`);
    }
  }

  // If exec_sql RPC doesn't exist, try /pg/query
  if (success === 0 && errors === 0) {
    console.log('  Trying /pg/query endpoint...');
    try {
      const resp = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });

      const text = await resp.text();
      console.log(`  Status: ${resp.status}`);
      console.log(`  Response: ${text.substring(0, 1000)}`);
    } catch (err) {
      console.error('❌ /pg/query failed:', err.message);
    }
  } else {
    console.log(`\n✅ ${success} statements succeeded, ${errors} errors`);
  }
}

runMigration().catch(console.error);