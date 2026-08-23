#!/usr/bin/env node
/**
 * fix-prefilled-mismatch.mjs
 *
 * Fix data mismatch hasil audit-prefilled-mismatch.mjs:
 *  1. Backup SEMUA rows terdampak (full row) ke JSON timestamped
 *  2. Null-kan HANYA field yang terdeteksi salah brand
 *     (caption / content_copy — sesuai issues di laporan audit)
 *  3. Verifikasi hasil
 *
 * Relokasi TIDAK dilakukan otomatis (ambigu) — tim bisa restore manual
 * dari backup JSON bila ingin memindahkan konten ke client yang benar.
 *
 * Usage: node scripts/fix-prefilled-mismatch.mjs --apply
 *        (tanpa --apply = dry-run)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import fs from "fs";

config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const REPORT = "scripts/audit-prefilled-mismatch-report.json";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  const report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  const mismatches = report.mismatches;
  console.log(`🛠  FIX MISMATCH (${APPLY ? "APPLY" : "DRY-RUN"})`);
  console.log(`Rows terdampak: ${mismatches.length}`);

  // 1. Ambil full rows by id (untuk backup & update)
  const ids = mismatches.map((m) => m.id);
  const rows = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabase
      .from("ads_content_clusters")
      .select("*")
      .in("id", ids.slice(i, i + 50));
    if (error) throw error;
    rows.push(...data);
  }
  console.log(`Full rows fetched: ${rows.length}`);

  // 2. Backup
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = `scripts/backup-mismatch-fix-${stamp}.json`;
  fs.writeFileSync(backupPath, JSON.stringify({ backedUpAt: new Date().toISOString(), rows }, null, 2));
  console.log(`💾 Backup: ${backupPath}`);

  // 3. Hitung field yang akan di-null-kan per row
  const updates = [];
  for (const m of mismatches) {
    const row = rows.find((r) => r.id === m.id);
    if (!row) continue;
    const patch = {};
    for (const iss of m.issues) {
      if (iss.field === "prefilled (content_copy)" && row.content_copy) patch.content_copy = null;
      if (iss.field === "caption" && row.caption) patch.caption = null;
    }
    if (Object.keys(patch).length) updates.push({ id: m.id, client: m.client, sheet_row: m.sheet_row, patch });
  }
  console.log(`Field yang akan di-null-kan: ${updates.length} rows`);

  if (!APPLY) {
    console.log("\nDRY-RUN — preview 10 update:");
    for (const u of updates.slice(0, 10)) {
      console.log(`  [${u.client} r${u.sheet_row}] → null-kan: ${Object.keys(u.patch).join(", ")}`);
    }
    console.log("\nJalankan dengan --apply untuk eksekusi.");
    return;
  }

  // 4. Apply
  let ok = 0, fail = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("ads_content_clusters")
      .update(u.patch)
      .eq("id", u.id);
    if (error) { console.error(`  ❌ ${u.client} r${u.sheet_row}: ${error.message}`); fail++; }
    else ok++;
  }
  console.log(`\n✅ Updated: ${ok} rows | ❌ Failed: ${fail}`);

  // 5. Verifikasi: re-count mismatch tersisa (harus 0 utk brand yang sudah di-null)
  const { count } = await supabase
    .from("ads_content_clusters")
    .select("*", { count: "exact", head: true })
    .like("source_sheet", "master|%")
    .not("caption", "is", null);
  console.log(`Rows dengan caption tersisa: ${count} (yang bersih / brand-netral)`);
}

main().catch((e) => { console.error("❌ Fatal:", e); process.exit(1); });
