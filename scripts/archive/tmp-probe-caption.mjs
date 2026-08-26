#!/usr/bin/env node
/** Probe: kenapa caption/content_copy diff persisten — baca DB sebelum & sesudah update */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows } = await sb
  .from("ads_content_clusters")
  .select("id, sheet_row, caption, content_copy, source_sheet")
  .eq("source_sheet", "master|Olive Cookies")
  .order("sheet_row");
console.log("=== DB master|Olive Cookies ===");
for (const r of rows || []) {
  console.log(`row=${r.sheet_row} id=${r.id}`);
  console.log(`  caption: ${JSON.stringify(r.caption)?.slice(0, 120)}`);
  console.log(`  content_copy: ${JSON.stringify(r.content_copy)?.slice(0, 80)}`);
}

// coba update langsung satu row
if (rows?.length) {
  const target = rows[0];
  const testVal = (target.caption || "x") + (target.caption?.endsWith("[t]") ? "" : "[t]");
  console.log(`\n=== UPDATE TEST row=${target.sheet_row}: caption → ${JSON.stringify(testVal).slice(0, 100)}`);
  const { error } = await sb.from("ads_content_clusters").update({ caption: testVal }).eq("id", target.id);
  console.log("update error:", error?.message || "none");
  const { data: after } = await sb.from("ads_content_clusters").select("caption").eq("id", target.id).single();
  console.log("read-back caption:", JSON.stringify(after?.caption)?.slice(0, 120));
  console.log("persisted:", after?.caption === testVal ? "✅ YA" : "❌ TIDAK (ditimpa sesuatu)");
}