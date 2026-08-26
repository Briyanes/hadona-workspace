#!/usr/bin/env node
/**
 * Cleanup placeholder "Copy di Note" dsb di ads_content_clusters (master|...):
 *  - theme (angle) placeholder → null
 *  - caption / content_copy placeholder → null
 *  - caption/content_copy kontaminasi lintas-sheet (teks identik muncul
 *    di ≥2 klien berbeda = artefak import lama) → null
 *
 * Usage:
 *   node scripts/tmp-cleanup-placeholder.mjs           # dry-run
 *   node scripts/tmp-cleanup-placeholder.mjs --apply   # eksekusi
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Placeholder text = instruksi, bukan konten
const isPh = (v) => {
  const t = (v || "").trim();
  return (
    /^paste\s*disini\.?$/i.test(t) ||
    /^pilih\s*disini\.?$/i.test(t) ||
    /^(copy|lihat|cek|cek\s*di|ada|baca|lihat)\s*di\s*notes?\.?$/i.test(t) ||
    /^di\s*notes?\.?$/i.test(t) ||
    /^(see|check)\s*notes?\.?$/i.test(t) ||
    /^see\s*note\.?$/i.test(t)
  );
};

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  console.log(APPLY ? "🚀 APPLY\n" : "🔍 DRY RUN (pakai --apply untuk eksekusi)\n");

  const { data: rows, error } = await supabase
    .from("ads_content_clusters")
    .select("id, source_sheet, client_hint, theme, caption, content_copy")
    .like("source_sheet", "master|%")
    .limit(5000);
  if (error) throw new Error(error.message);
  console.log(`Master rows: ${rows.length}`);

  // --- 1. Placeholder langsung ---
  const phPatches = [];
  for (const r of rows) {
    const patch = {};
    if (r.theme && isPh(r.theme)) patch.theme = null;
    if (r.caption && isPh(r.caption)) patch.caption = null;
    if (r.content_copy && isPh(r.content_copy)) patch.content_copy = null;
    if (Object.keys(patch).length) phPatches.push({ id: r.id, sheet: r.source_sheet, patch });
  }
  console.log(`\n[1] Placeholder theme/caption/prefilled: ${phPatches.length} rows`);
  for (const p of phPatches.slice(0, 10))
    console.log(`   ~ ${p.sheet.replace("master|", "")}: ${Object.keys(p.patch).join(",")}`);

  // --- 2. Kontaminasi lintas-sheet (caption/prefilled identik di ≥2 klien) ---
  const byCap = new Map();
  for (const r of rows) {
    if (!r.caption || r.caption.length < 15) continue; // teks pendek bisa kebetulan sama
    const k = norm(r.caption);
    if (!k) continue;
    if (!byCap.has(k)) byCap.set(k, []);
    byCap.get(k).push(r);
  }
  const contam = new Map(); // id → patch
  for (const [, rs] of byCap) {
    const clients = new Set(rs.map((r) => r.client_hint || r.source_sheet));
    if (clients.size >= 2 && rs.length >= 2) {
      for (const r of rs) {
        contam.set(r.id, {
          id: r.id,
          sheet: r.source_sheet,
          reason: `caption duplikat di ${clients.size} sheet (${[...clients].slice(0, 4).join(", ")})`,
        });
      }
    }
  }
  console.log(`\n[2] Kontaminasi caption lintas-sheet: ${contam.size} rows`);
  for (const c of [...contam.values()].slice(0, 10)) console.log(`   ~ ${c.sheet.replace("master|", "")}: ${c.reason}`);

  if (!APPLY) {
    console.log("\n[DRY RUN] Tidak ada perubahan. Jalankan dengan --apply.");
    return;
  }

  // --- Apply 1 ---
  let ok1 = 0, err1 = 0;
  for (const p of phPatches) {
    const { error: e } = await supabase.from("ads_content_clusters").update(p.patch).eq("id", p.id);
    if (e) { err1++; console.error(`   ❌ ${p.id}: ${e.message}`); } else ok1++;
  }
  console.log(`\n✅ Placeholder: ${ok1} updated, ${err1} error`);

  // --- Apply 2 ---
  let ok2 = 0, err2 = 0;
  for (const c of contam.values()) {
    const { error: e } = await supabase
      .from("ads_content_clusters")
      .update({ caption: null })
      .eq("id", c.id);
    if (e) { err2++; console.error(`   ❌ ${c.id}: ${e.message}`); } else ok2++;
  }
  console.log(`✅ Kontaminasi caption: ${ok2} updated, ${err2} error`);
}

