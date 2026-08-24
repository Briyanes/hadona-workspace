#!/usr/bin/env node
/**
 * reset-and-reimport-ads-creative.mjs
 *
 * Reset total tabel ads_content_clusters lalu import ulang dari
 * spreadsheet master publish (via import-ads-creative-master-v2.mjs).
 *
 * Alur:
 *   1. Backup SEMUA baris ads_content_clusters → JSON lokal (jaga-jaga rollback)
 *   2. Safety check: abort jika ada baris manual (created_by terisi) —
 *      data manual tidak boleh hilang
 *   3. DELETE semua baris
 *   4. Jalankan import v2 (fresh insert, tanpa dedup lama)
 *
 * Usage:
 *   node scripts/reset-and-reimport-ads-creative.mjs --dry-run   # backup+cek saja, tanpa delete
 *   node scripts/reset-and-reimport-ads-creative.mjs             # eksekusi penuh
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--preview");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — backup & safety check saja (tanpa delete)\n" : "🚀 Reset & Re-import Ads Creative\n");

  // --- 1. Ambil semua baris untuk backup ---
  const { data: all, error: fetchErr } = await supabase
    .from("ads_content_clusters")
    .select("*")
    .order("created_at", { ascending: true });
  if (fetchErr) {
    console.error("❌ Gagal fetch ads_content_clusters:", fetchErr.message);
    process.exit(1);
  }
  console.log(`1️⃣  Baris saat ini: ${all.length}`);

  // --- 2. Safety check: tidak boleh ada baris manual ---
  const manual = (all || []).filter((r) => r.created_by);
  if (manual.length > 0) {
    console.error(`❌ ABORT: ada ${manual.length} baris dibuat manual via UI (created_by terisi).`);
    console.error("   Hapus/handle dulu baris manual tsb, atau jalankan import v2 biasa (safe-upsert).");
    process.exit(1);
  }
  console.log("2️⃣  Safety check OK: 0 baris manual (created_by kosong semua)");

  // --- 3. Backup ke JSON ---
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join("scripts", `backup-ads-clusters-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(all, null, 2), "utf-8");
  console.log(`3️⃣  Backup tersimpan: ${backupPath} (${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB)`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Selesai — tidak ada delete/import. Jalankan tanpa flag untuk eksekusi penuh.");
    return;
  }

  // --- 4. DELETE semua ---
  const { error: delErr, count: delCount } = await supabase
    .from("ads_content_clusters")
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000"); // match semua (id bukan dummy)
  if (delErr) {
    console.error("❌ Gagal delete:", delErr.message);
    console.error(`   Restore manual bisa dari backup: ${backupPath}`);
    process.exit(1);
  }
  console.log(`4️⃣  DELETE selesai: ${delCount ?? "?"} baris dihapus`);

  // verifikasi benar-benar kosong
  const { count: remaining } = await supabase
    .from("ads_content_clusters")
    .select("*", { count: "exact", head: true });
  if (remaining > 0) {
    console.error(`❌ Masih ada ${remaining} baris setelah delete — abort sebelum import.`);
    process.exit(1);
  }
  console.log("5️⃣  Tabel kosong terverifikasi (0 baris)");

  // --- 5. Import ulang via v2 ---
  console.log("6️⃣  Menjalankan import v2...\n");
  const res = spawnSync("node", ["scripts/import-ads-creative-master-v2.mjs"], {
    stdio: "inherit",
    env: process.env,
  });
  if (res.status !== 0) {
    console.error(`\n❌ Import v2 gagal (exit ${res.status}). Restore manual dari: ${backupPath}`);
    process.exit(res.status || 1);
  }

  // --- 6. Ringkasan akhir ---
  const { count: final } = await supabase
    .from("ads_content_clusters")
    .select("*", { count: "exact", head: true });
  const { count: noLink } = await supabase
    .from("ads_content_clusters")
    .select("*", { count: "exact", head: true })
    .is("result_link", null);
  console.log(`\n✅ SELESAI: ${final} baris bersih | tanpa link: ${noLink} | backup: ${backupPath}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});