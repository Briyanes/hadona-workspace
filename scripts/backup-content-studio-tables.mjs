#!/usr/bin/env node
/**
 * backup-content-studio-tables.mjs
 * Backup 3 tabel Content Studio ke JSON sebelum di-truncate/re-import.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync } from "fs";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = ["ads_creative_requests", "ads_captions", "ads_content_clusters"];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = {};

for (const t of TABLES) {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(t).select("*").range(from, from + 999);
    if (error) {
      console.error(`❌ ${t}: ${error.message}`);
      backup[t] = { error: error.message };
      break;
    }
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  if (!backup[t]?.error) {
    backup[t] = rows;
    console.log(`✅ ${t}: ${rows.length} rows`);
  }
}

const file = `scripts/backup-content-studio-${stamp}.json`;
writeFileSync(file, JSON.stringify(backup, null, 2));
console.log(`\n💾 Backup tersimpan: ${file}`);