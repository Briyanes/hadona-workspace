#!/usr/bin/env node
/**
 * reset-content-studio.mjs
 * Kosongkan 3 tabel Content Studio (backup dulu via backup-content-studio-tables.mjs!):
 *   - ads_content_clusters → akan di-re-import fresh dari master sheet
 *   - ads_creative_requests → kosong (tab Ads Creative Requests tampil kosong)
 *   - ads_captions → kosong (tab Ads Caption Bank tampil kosong)
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const DRY_RUN = process.argv.includes("--dry-run");

for (const table of ["ads_content_clusters", "ads_creative_requests", "ads_captions"]) {
  let total = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("id").limit(1000);
    if (error) {
      console.error(`❌ ${table}: ${error.message}`);
      break;
    }
    if (!data || !data.length) break;
    if (DRY_RUN) { total += data.length; break; }
    const ids = data.map((r) => r.id);
    const { error: delErr } = await supabase.from(table).delete().in("id", ids);
    if (delErr) {
      console.error(`❌ ${table} delete: ${delErr.message}`);
      break;
    }
    total += ids.length;
    console.log(`   ${table}: -${ids.length} (total ${total})`);
  }
  console.log(`${DRY_RUN ? "[DRY] " : "🗑️ "} ${table}: ${total} rows ${DRY_RUN ? "akan dihapus" : "dihapus"}`);
}
console.log(DRY_RUN ? "\n[DRY RUN] selesai — tidak ada yang dihapus" : "\n✅ Semua tabel dikosongkan. Jalankan import-ads-creative-master.mjs selanjutnya.");