#!/usr/bin/env node
/** Merge duplikat (source_sheet, sheet_row) di ads_content_clusters → 1 row utuh, sisanya dihapus */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const DRY = process.argv.includes("--dry-run");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const COLS = ["progress", "pillar", "details", "format_type", "theme", "result_link", "caption", "content_copy", "upload_date", "client_id", "client_hint"];

const { data: rows, error } = await sb
  .from("ads_content_clusters")
  .select("*")
  .like("source_sheet", "master|%")
  .order("created_at", { ascending: true });
if (error) { console.error("❌", error.message); process.exit(1); }

const groups = new Map();
for (const r of rows) {
  const k = `${r.source_sheet}#${r.sheet_row}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

let merged = 0, deleted = 0, patched = 0;
for (const [k, g] of groups) {
  if (g.length < 2) continue;
  merged++;
  const keeper = g[0]; // created_at paling awal
  const others = g.slice(1);
  const patch = {};
  for (const c of COLS) {
    if (keeper[c] == null) {
      const donor = others.find((o) => o[c] != null);
      if (donor) patch[c] = donor[c];
    }
  }
  if (Object.keys(patch).length) {
    console.log(`~ ${k}: merge ${Object.keys(patch).join(",")} dari ${others.length} duplikat`);
    if (!DRY) {
      const { error: e1 } = await sb.from("ads_content_clusters").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", keeper.id);
      if (e1) { console.error(`  ❌ patch ${keeper.id}: ${e1.message}`); continue; }
      patched++;
    }
  } else {
    console.log(`= ${k}: keeper sudah lengkap, hapus ${others.length} duplikat`);
  }
  if (!DRY) {
    for (const o of others) {
      const { error: e2 } = await sb.from("ads_content_clusters").delete().eq("id", o.id);
      if (e2) console.error(`  ❌ delete ${o.id}: ${e2.message}`);
      else deleted++;
    }
  }
}

console.log(`${DRY ? "[DRY] " : ""}✅ Grup duplikat: ${merged} | patched: ${patched} | dihapus: ${deleted} | total rows awal: ${rows.length}`);