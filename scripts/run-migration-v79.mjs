/**
 * Run migration-v79.sql against Supabase database
 * Uses the Supabase SQL endpoint with service role key
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rsxqjjcuixdsmijhgdyl.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY env var first!");
  process.exit(1);
}

async function runMigration() {
  const sql = readFileSync('supabase/migration-v79.sql', 'utf8');
  
  console.log('📋 Running migration-v79.sql...');
  console.log(`   SQL length: ${sql.length} chars\n`);

  // Split into individual statements (rough split on semicolons)
  // We'll try the /pg/query endpoint first
  try {
    const resp = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });

    const text = await resp.text();
    console.log(`   Status: ${resp.status}`);
    
    try {
      const json = JSON.parse(text);
      console.log('   Response:', JSON.stringify(json, null, 2));
    } catch {
      console.log('   Response:', text.substring(0, 500));
    }
  } catch (err) {
    console.error('❌ /pg/query failed:', err.message);
  }
}

runMigration();