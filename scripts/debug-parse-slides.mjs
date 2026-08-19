/**
 * Ambil details dari Supabase (row dengan pola "Slide") & test parseSlides regex
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key);

const { data, error } = await sb
  .from("content_plans")
  .select("id, client_id, konten, details")
  .not("details", "is", null)
  .ilike("details", "%slide%")
  .limit(5);

if (error) {
  console.error("❌", error.message);
  process.exit(1);
}

const regex = /\bslide\s*(\d+)\s*[:.]/gi;
for (const row of data) {
  const matches = [...row.details.matchAll(regex)];
  console.log(`\n═══ Row ${row.id} (konten=${row.konten}) ═══`);
  console.log(`   Panjang details : ${row.details.length} chars`);
  console.log(`   Match "Slide N:" : ${matches.length} → ${matches.map((m) => m[0].trim()).join(" | ")}`);
  console.log(`   parseSlides     : ${matches.length >= 2 ? "AKAN RENDER ACCORDION ✅" : "FALLBACK ExpandableText (butuh ≥2 match)"}`);
  console.log(`   Preview         : ${JSON.stringify(row.details.slice(0, 200))}`);
}