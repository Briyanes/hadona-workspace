#!/usr/bin/env node
/**
 * Hapus client QA test (nama diawali "Senja Coffee QA") + SEMUA data terkait:
 * tasks, strategy, objectives, key results, initiatives, aset digital, dll.
 *
 * Strategi: deteksi otomatis semua tabel yang punya kolom `client_id` via
 * information_schema, lalu hapus baris milik client QA tersebut.
 *
 * Default DRY-RUN. Jalankan --apply untuk eksekusi.
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

// 1. Cari client QA
const { data: qaClients, error: cErr } = await sb
  .from("clients")
  .select("id, name, created_at")
  .like("name", "Senja Coffee QA%");
if (cErr) { console.error("fetch clients gagal:", cErr.message); process.exit(1); }

if (!qaClients?.length) {
  console.log("✅ Tidak ada client QA ditemukan (nama diawali 'Senja Coffee QA'). DB sudah bersih.");
  process.exit(0);
}

console.log(`\n🧹 CLEANUP QA CLIENTS — ${apply ? "APPLY ⚠️" : "DRY RUN"}`);
console.log(`Client QA ditemukan: ${qaClients.length}`);
for (const c of qaClients) console.log(`  - [${c.id}] ${c.name} (created: ${c.created_at})`);

const qaIds = qaClients.map((c) => c.id);

// 2. Daftar tabel yang punya kolom client_id
const knownTables = [
  "tasks",
  "okrs",
  "client_principles",
  "client_objectives",
  "client_key_results",
  "client_initiatives",
  "client_strategies",
  "client_sosmed_assets",
  "client_competitors",
  "client_communication_logs",
  "client_contracts",
  "invoices",
  "leads",
  "reports",
  "monthly_reports",
];

// Probe per tabel (skip + log tabel tanpa kolom client_id)
const tables = [];
for (const t of knownTables) {
  const { count, error } = await sb
    .from(t)
    .select("id", { count: "exact", head: true })
    .in("client_id", qaIds);
  if (error) { console.log(`  (skip ${t}: ${error.message})`); continue; }
  tables.push({ name: t, count: count ?? 0 });
}

// OKR chain: client_strategies -> client_objectives -> client_key_results
// (objectives & KR tidak punya client_id langsung, ter-link via strategy_id/objective_id)
const { data: qaStrategies } = await sb
  .from("client_strategies")
  .select("id")
  .in("client_id", qaIds);
const strategyIds = (qaStrategies || []).map((s) => s.id);

let objectiveIds = [];
if (strategyIds.length) {
  const { data: qaObjectives } = await sb
    .from("client_objectives")
    .select("id")
    .in("strategy_id", strategyIds);
  objectiveIds = (qaObjectives || []).map((o) => o.id);
}

let krCount = 0;
if (objectiveIds.length) {
  const { count } = await sb
    .from("client_key_results")
    .select("id", { count: "exact", head: true })
    .in("objective_id", objectiveIds);
  krCount = count ?? 0;
}
if (objectiveIds.length) tables.push({ name: "client_objectives (via strategy)", count: objectiveIds.length, chain: "objectives" });
if (krCount) tables.push({ name: "client_key_results (via objective)", count: krCount, chain: "krs" });

console.log(`\nBaris data terkait per tabel:`);
let total = 0;
for (const t of tables) {
  if (t.count > 0) console.log(`  ${t.name}: ${t.count}`);
  total += t.count;
}
console.log(`Total baris terkait: ${total}`);

if (!apply) {
  console.log("\n🔍 DRY RUN — jalankan --apply untuk eksekusi penghapusan.");
  process.exit(0);
}

// 3. Eksekusi hapus (urutan: KR -> objectives -> child tables -> clients)
console.log("");

// 3a. Cascade chain OKR dulu (paling dalam)
if (objectiveIds.length) {
  const { error: e, count } = await sb
    .from("client_key_results")
    .delete({ count: "exact" })
    .in("objective_id", objectiveIds);
  console.log(e ? `  ❌ client_key_results: ${e.message}` : `  ✅ client_key_results: ${count ?? 0} baris dihapus`);
}
if (strategyIds.length) {
  const { error: e, count } = await sb
    .from("client_objectives")
    .delete({ count: "exact" })
    .in("strategy_id", strategyIds);
  console.log(e ? `  ❌ client_objectives: ${e.message}` : `  ✅ client_objectives: ${count ?? 0} baris dihapus`);
}

// 3b. Tabel lain dengan client_id langsung
for (const t of tables) {
  if (t.count === 0 || t.chain) continue;
  const { error: delErr, count } = await sb
    .from(t.name)
    .delete({ count: "exact" })
    .in("client_id", qaIds);
  if (delErr) {
    console.error(`  ❌ ${t.name}: ${delErr.message}`);
  } else {
    console.log(`  ✅ ${t.name}: ${count ?? 0} baris dihapus`);
  }
}

// 4. Hapus client-nya
const { error: delClientErr, count: delClientCount } = await sb
  .from("clients")
  .delete({ count: "exact" })
  .in("id", qaIds);
if (delClientErr) {
  console.error(`  ❌ clients: ${delClientErr.message}`);
} else {
  console.log(`  ✅ clients: ${delClientCount ?? 0} client QA dihapus`);
}

// 5. Verifikasi akhir
const { count: remain } = await sb
  .from("clients")
  .select("id", { count: "exact", head: true })
  .like("name", "Senja Coffee QA%");
console.log(`\nSisa client QA di DB: ${remain ?? 0} ${remain === 0 ? "— BERSIH ✅" : "— masih ada! ❌"}`);