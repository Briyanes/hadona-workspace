#!/usr/bin/env node
/**
 * Bersihkan client_initiatives dari artefak import strategy sheet:
 *
 *   1. Header rows: description literal "Description" (header sheet ikut ter-import) -> hapus SEMUA
 *   2. Salah assign massal: strategi Bolu Kukis (bakery) terduplikasi exact ke client lain
 *      -> hapus baris di client != Bolu Kukis yang deskripsinya EXACT MATCH dengan milik Bolu Kukis
 *      (exact-match = aman: konten umroh Tombo Ati / RMODA yang strukturnya mirip tidak tersentuh)
 *
 * Catatan: SHUMI Japan & Nouban punya 15 deskripsi identik (hair care) — tidak jelas pemilik sah,
 * TIDAK dihapus, hanya dilaporkan untuk review manual.
 *
 * Default dry-run. --apply untuk eksekusi.
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";

const env = {};
for (const line of readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const apply = process.argv.includes("--apply");

const { data: all, error } = await sb.from("client_initiatives").select("id, client_id, description");
if (error) { console.error("fetch gagal:", error.message); process.exit(1); }

const { data: clients } = await sb.from("clients").select("id, name");
const nameOf = Object.fromEntries((clients || []).map((c) => [c.id, c.name]));
const idOf = (n) => (clients || []).find((c) => c.name === n)?.id;

const boluKukisId = idOf("Bolu Kukis");
if (!boluKukisId) { console.error("Client Bolu Kukis tidak ditemukan"); process.exit(1); }

// 1) Header artefak
const headerRows = all.filter((i) => (i.description || "").trim() === "Description");

// 2) Salah assign: exact match deskripsi Bolu Kukis di client lain
const boluDescs = new Set(all.filter((i) => i.client_id === boluKukisId).map((i) => (i.description || "").trim()));
const misplaced = all.filter((i) => i.client_id !== boluKukisId && boluDescs.has((i.description || "").trim()));

const toDelete = [...headerRows, ...misplaced];

console.log(`\n🧹 CLEANUP client_initiatives — ${apply ? "APPLY" : "DRY RUN"}`);
console.log(`Total baris: ${all.length}`);
console.log(`Header artefak "Description": ${headerRows.length}`);
console.log(`Salah assign (strategi Bolu Kukis di client lain): ${misplaced.length}`);
console.log(`Akan dihapus total: ${toDelete.length}\n`);

// distribusi hapus per client
const delByClient = {};
for (const i of toDelete) delByClient[nameOf[i.client_id] || i.client_id] = (delByClient[nameOf[i.client_id] || i.client_id] || 0) + 1;
console.log("Distribusi penghapusan per client:");
for (const [n, c] of Object.entries(delByClient).sort((a, b) => b[1] - a[1])) console.log(`  ${n}: ${c}`);

// sisa baris bersih per client (setelah hapus)
const remainByClient = {};
for (const i of all) if (!toDelete.includes(i)) {
  remainByClient[nameOf[i.client_id] || i.client_id] = (remainByClient[nameOf[i.client_id] || i.client_id] || 0) + 1;
}
console.log("\nSisa baris bersih per client:");
for (const [n, c] of Object.entries(remainByClient).sort()) console.log(`  ${n}: ${c}`);

// info: duplikat SHUMI/Nouban (tidak dihapus)
const shumiDescs = new Set(all.filter((i) => nameOf[i.client_id] === "SHUMI Japan").map((i) => i.description));
const noubanOverlap = all.filter((i) => nameOf[i.client_id] === "Nouban" && shumiDescs.has(i.description));
if (noubanOverlap.length) console.log(`\nℹ️  INFO: Nouban punya ${noubanOverlap.length} deskripsi identik dengan SHUMI Japan (hair care) — TIDAK dihapus, review manual.`);

if (!apply) { console.log("\n🔍 DRY RUN — jalankan --apply untuk eksekusi."); process.exit(0); }

const ids = toDelete.map((i) => i.id);
const BATCH = 200;
let deleted = 0;
for (let i = 0; i < ids.length; i += BATCH) {
  const { error: delErr, count } = await sb.from("client_initiatives").delete({ count: "exact" }).in("id", ids.slice(i, i + BATCH));
  if (delErr) { console.error("❌ delete gagal:", delErr.message); process.exit(1); }
  deleted += count ?? 0;
}
console.log(`\n✅ ${deleted} baris sampah dihapus.`);

const { count: remain } = await sb.from("client_initiatives").select("id", { count: "exact", head: true });
console.log(`Sisa baris bersih: ${remain}`);