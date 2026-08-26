#!/usr/bin/env node
/** Cleanup noise numerik & kontaminasi di rows master| (nilai yang tak bisa di-clear importer karena payload null→preserve) */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DRY = process.argv.includes("--dry-run");

const { data: rows } = await sb
  .from("ads_content_clusters")
  .select("id, source_sheet, sheet_row, caption, content_copy")
  .like("source_sheet", "master|%");
if (!rows) { console.error("gagal baca"); process.exit(1); }

const fixes = [];
for (const r of rows) {
  const patch = {};
  // caption: post-ID murni / angka + marker test "[t]"
  if (r.caption && /^\d+(\[t\])?$/.test(r.caption.trim())) patch.caption = null;
  // content_copy: angka murni (jumlah konten "24"/"28" hasil import lama)
  if (r.content_copy && /^\d+$/.test(r.content_copy.trim())) patch.content_copy = null;
  // kontaminasi lintas-klien: prefilled TPDOC di sheet Bolu Pisang
  if (r.source_sheet === "master|Bolu Pisang bu Winda" && r.content_copy && /TPDOC/i.test(r.content_copy)) patch.content_copy = null;
  if (Object.keys(patch).length) fixes.push({ r, patch });
}

console.log(`Rows diperiksa: ${rows.length}, perlu fix: ${fixes.length}\n`);
for (const { r, patch } of fixes) {
  console.log(`${r.source_sheet} #${r.sheet_row}: caption=${JSON.stringify(r.caption)?.slice(0, 30)} cc=${JSON.stringify(r.content_copy)?.slice(0, 30)} → ${JSON.stringify(patch)}`);
  if (!DRY) {
    const { error } = await sb.from("ads_content_clusters").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) console.error(`  ❌ ${error.message}`);
  }
}
if (!DRY) {
  const { count } = await sb
    .from("ads_content_clusters")
    .select("id", { count: "exact", head: true })
    .like("source_sheet", "master|%")
    .or("caption.regex.^\\d+$,content_copy.regex.^\\d+$");
  console.log(`\nSisa noise numerik setelah fix: ${count ?? "?"}`);
}
console.log(DRY ? "\n[DRY RUN] tidak ada write" : "\n✅ Selesai");