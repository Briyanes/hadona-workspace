#!/usr/bin/env node
/**
 * Bersihkan tabel `okrs` hasil import sheet yang "kotor":
 *   1. Hapus baris sampah (client_id null + KR berawalan nomor/bullet — artefak import, BUKAN agency OKR)
 *   2. Pecah 1 baris berisi banyak KR (dipisah newline / "- " / "1. ") → 1 baris = 1 KR
 *   3. Hapus duplikat KR identik dalam objective yang sama (client + objective + quarter + year)
 *   4. Buang KR yang menyebut nama client LAIN (artefak copy-paste antar tab, mis. "RMODA Studio BSD" di tab Makassar)
 *
 * Agency OKR asli (client_id null, dibuat via UI) TIDAK disentuh.
 *
 * Usage:
 *   node scripts/rewrite-okrs-clean.mjs           → dry-run (laporan saja)
 *   node scripts/rewrite-okrs-clean.mjs --apply   → eksekusi ke DB production
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";

// ---- env ----
const env = {};
for (const line of readFileSync(path.resolve(".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local");
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const apply = process.argv.includes("--apply");

// ---- helpers ----
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Pecah satu sel key_result → daftar KR bersih
function splitKeyResults(raw) {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((l) =>
      l
        .replace(/^\s*(?:[-–—•*]\s*)+/, "") // bullet: - • * —
        .replace(/^\s*\d+\s*[.)]\s*/, "") //   numbering: 1. / 1)
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter((l) => l.length >= 3);
}

// Tanda baris import sampah: KR masih berawalan nomor/bullet + tidak ada progres
const looksLikeImportGarbage = (kr) => /^\s*(?:\d+\s*[.)]|[-–—•*])\s+/.test(String(kr || ""));

// ---- load data ----
const { data: clients } = await supabase.from("clients").select("id, name");
if (!clients) { console.error("❌ Gagal fetch clients"); process.exit(1); }
const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));

// Nama normalkan untuk deteksi KR nyasar ke client lain (min. 6 char biar tak salah tangkap)
const otherClientNames = clients
  .map((c) => ({ id: c.id, n: norm(c.name) }))
  .filter((x) => x.n.length >= 6);

function mentionsOtherClient(clientId, text) {
  const t = norm(text);
  for (const o of otherClientNames) {
    if (o.id === clientId) continue;
    if (t.includes(o.n)) return clientName[o.id];
  }
  return null;
}

const { data: okrs, error } = await supabase
  .from("okrs")
  .select("id, client_id, objective, key_result, quarter, year, owner_id, target_value, actual_value, unit, baseline_value, metric_name, kr_type, progress_pct, status, notes");
if (error || !okrs) { console.error("❌ Gagal fetch okrs:", error?.message); process.exit(1); }

console.log(`\n📦 ${okrs.length} baris okrs di DB${apply ? " — MODE APPLY" : " — DRY RUN"}\n`);

// ---- proses ----
const garbageRows = [];      // client_id null + sampah import → delete
const cleanRows = [];        // baris baru hasil split/dedupe/filter
const stats = { split: 0, dupe: 0, crossClient: 0, emptyDropped: 0 };
const seen = new Set();      // dedupe: client|objective|quarter|year|normKR

for (const row of okrs) {
  if (!row.client_id) {
    if (looksLikeImportGarbage(row.key_result)) garbageRows.push(row);
    continue; // agency OKR asli / baris null lain → tidak disentuh
  }

  const parts = splitKeyResults(row.key_result);
  if (parts.length > 1) stats.split += parts.length - 1;
  if (!parts.length) { stats.emptyDropped++; continue; }

  for (const kr of parts) {
    const other = mentionsOtherClient(row.client_id, kr);
    if (other) {
      stats.crossClient++;
      console.log(`  🚫 Buang (nyebut client lain "${other}"): "${kr.slice(0, 60)}${kr.length > 60 ? "…" : ""}" [${clientName[row.client_id]}]`);
      continue;
    }
    const key = `${row.client_id}|${norm(row.objective)}|${row.quarter}|${row.year}|${norm(kr)}`;
    if (seen.has(key)) { stats.dupe++; continue; }
    seen.add(key);
    cleanRows.push({
      client_id: row.client_id,
      objective: row.objective,
      key_result: kr,
      quarter: row.quarter,
      year: row.year,
      owner_id: row.owner_id,
      target_value: row.target_value,
      actual_value: row.actual_value,
      unit: row.unit,
      baseline_value: row.baseline_value,
      metric_name: row.metric_name,
      kr_type: row.kr_type,
      progress_pct: row.progress_pct,
      status: row.status,
      notes: row.notes,
    });
  }
}

// ---- laporan ----
const clientRows = okrs.filter((r) => r.client_id).length;
console.log(`\n📊 RINGKASAN:`);
console.log(`  Baris client OKR   : ${clientRows}`);
console.log(`  Baris hasil bersih : ${cleanRows.length} (1 baris = 1 KR)`);
console.log(`  KR dipecah         : +${stats.split}`);
console.log(`  Duplikat dibuang   : ${stats.dupe}`);
console.log(`  KR client lain     : ${stats.crossClient}`);
console.log(`  Baris kosong       : ${stats.emptyDropped}`);
console.log(`  Sampah client null : ${garbageRows.length}`);
for (const g of garbageRows) console.log(`     🗑  [${g.id.slice(0, 8)}] "${String(g.key_result).slice(0, 50)}"`);

// per client
const perClient = {};
for (const r of cleanRows) perClient[clientName[r.client_id]] = (perClient[clientName[r.client_id]] || 0) + 1;
console.log(`\n  Per client:`);
for (const [name, n] of Object.entries(perClient).sort((a, b) => b[1] - a[1])) console.log(`    ${name}: ${n} KR`);

// ---- eksekusi ----
if (!apply) {
  console.log("\n🔍 DRY RUN — tidak ada data diubah. Jalankan dengan --apply untuk eksekusi.");
  process.exit(0);
}

// 1) hapus sampah client null
if (garbageRows.length) {
  const { error: e1 } = await supabase.from("okrs").delete().in("id", garbageRows.map((g) => g.id));
  if (e1) console.error(`❌ hapus sampah gagal: ${e1.message}`);
  else console.log(`\n🗑  ${garbageRows.length} baris sampah dihapus`);
}

// 2) replace baris client lama → baris bersih
const { error: e2 } = await supabase.from("okrs").delete().not("client_id", "is", null);
if (e2) { console.error("❌ delete client okrs gagal:", e2.message); process.exit(1); }

// insert ber-batch
const BATCH = 100;
for (let i = 0; i < cleanRows.length; i += BATCH) {
  const { error: e3 } = await supabase.from("okrs").insert(cleanRows.slice(i, i + BATCH));
  if (e3) { console.error(`❌ insert batch ${i / BATCH + 1} gagal: ${e3.message}`); process.exit(1); }
}
console.log(`✅ ${cleanRows.length} baris KR bersih ditulis — cek /strategy`);