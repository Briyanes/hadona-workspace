#!/usr/bin/env node
/**
 * Import "Objective Key Result Client" sheet (format: 1 tab = 1 client).
 * Setiap tab berisi section:
 *   - Objective Key Result Summary → okrs
 *   - No|Category|Description (4M)  → client_principles
 *   - Strategy and KPI (SM|/ADS|)  → client_initiatives
 *   - Timeline and Key Actions     → hanya dilaporkan (tidak diimport)
 * Usage:
 *   node scripts/import-okr-client-sheet.mjs <sheetUrl> [--dry-run] [--create-missing]
 *   --create-missing: tab tanpa client di DB dibuatkan client baru (status inactive)
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

const sheetUrl = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const createMissing = process.argv.includes("--create-missing");
if (!sheetUrl || !sheetUrl.includes("docs.google.com")) {
  console.error("Usage: node scripts/import-okr-client-sheet.mjs <sheetUrl> [--dry-run]");
  process.exit(1);
}

// ---- helpers ----
const extractBase = (u) =>
  (u.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/) || u.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || null;

// Pair name ↔ gid dalam blok items.push yang SAMA:
// items.push({name: "X", pageUrl: "...gid=G", gid: "G", ...})
function extractTabs(html) {
  const tabs = [];
  const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[\s\S]{0,400}?gid:\s*"(\d+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const name = m[1].replace(/\\(.)/g, "$1").trim();
    if (name) tabs.push({ name, gid: m[2] });
  }
  return tabs;
}

function parseCsv(text) {
  const rows = []; let row = []; let cur = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clean = (s) => (s || "").replace(/\r/g, "").trim();

// Satu sel key_result bisa berisi banyak KR (multi-baris dalam satu sel) → pecah jadi KR individual.
// Skema tabel okrs: 1 baris = 1 KR (UI memberi progress bar per baris).
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
const category = (v) => {
  const c = (v || "").toLowerCase();
  if (c.includes("man")) return "manpower";
  if (c.includes("tool")) return "tools";
  if (c.includes("budget") || c.includes("dana")) return "budget";
  return "mindset";
};
const tagOf = (desc) => (/^\s*sm\b/i.test(desc) ? "SM" : "ADS");

// ---- parse satu tab client → sections ----
function parseTab(csv) {
  const rows = parseCsv(csv);
  const out = { okrs: [], principles: [], initiatives: [], timeline: [], profile: null };

  // Profile: baris setelah header "Client Profile" → kolom B = deskripsi, kolom C = services
  for (let i = 0; i < Math.min(rows.length, 4); i++) {
    if ((rows[i][1] || "").toLowerCase().includes("client profile")) {
      const next = rows[i + 1] || [];
      if (clean(next[1]) || clean(next[2])) out.profile = { description: clean(next[1]), services: clean(next[2]) };
      break;
    }
  }

  let mode = null; // "okr" | "principles" | "initiatives" | "timeline"
  let headers = [];
  const isHeader = (r) => {
    const j = r.map((c) => clean(c).toLowerCase()).join("|");
    if (j.includes("objective") && j.includes("key result")) return "okr";
    if (/^no\|/.test(j) && j.includes("category") && j.includes("description")) return "principles";
    if (/^no\|/.test(j) && j.startsWith("no|description")) return "initiatives";
    if (/^no\|/.test(j) && j.includes("key action")) return "timeline";
    return null;
  };

  for (const r of rows) {
    const h = isHeader(r);
    if (h) { mode = h; headers = r.map((c) => clean(c).toLowerCase()); continue; }
    // Section title (mis. "Strategy and KPI") atau baris kosong → reset mode jika baris punya teks section
    const joined = r.map((c) => clean(c)).filter(Boolean).join(" ");
    if (joined && !r.some((c, idx) => idx > 0 && clean(c)) === false) {
      if (/^(objective key result|strategy and kpi|timeline and key actions|no,)/i.test(joined) || /^client (profile|services)/i.test(joined)) mode = null;
    }
    if (!mode || !r.some((c) => clean(c))) continue;
    const col = (name) => {
      const i = headers.findIndex((x) => x.includes(name));
      return i >= 0 ? clean(r[i]) : "";
    };
    const no = col("no");
    if (!/^\d+$/.test(no)) continue; // hanya baris bernomor
    if (mode === "okr") {
      const obj = col("objective"), kr = col("key result");
      if (obj || kr) {
        const seen = new Set();
        for (const part of splitKeyResults(kr)) {
          const k = norm(part); // dedupe KR identik dalam baris/objective yang sama
          if (seen.has(k)) continue;
          seen.add(k);
          out.okrs.push({ objective: obj, key_result: part });
        }
      }
    } else if (mode === "principles") {
      const cat = col("category"), desc = col("description");
      if (desc) out.principles.push({ category: category(cat), description: desc });
    } else if (mode === "initiatives") {
      const desc = col("description");
      if (desc) out.initiatives.push({ description: desc, tag: tagOf(desc) });
    } else if (mode === "timeline") {
      const action = col("key action");
      if (action) out.timeline.push({ action, owner: col("process owner"), start: col("start date"), end: col("end date") });
    }
  }
  return out;
}

// ---- main ----
const base = extractBase(sheetUrl);
if (!base) { console.error("❌ URL tidak valid"); process.exit(1); }

console.log(`\n🌐 Fetching: ${base}${dryRun ? " (DRY RUN)" : ""}`);
const html = await (await fetch(`https://docs.google.com/spreadsheets/d/e/${base}/pubhtml`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" } })).text();
const tabs = extractTabs(html);
if (!tabs.length) { console.error("❌ Tab tidak ditemukan — pastikan sheet sudah publish to web"); process.exit(1); }
console.log(`📋 ${tabs.length} tab: ${tabs.map((t) => t.name).join(", ")}\n`);

const { data: clients } = await supabase.from("clients").select("id, name");
const clientMap = {};
for (const c of clients || []) clientMap[norm(c.name)] = { id: c.id, name: c.name };

// Alias manual: nama tab (dinormalisasi) → nama client di DB (dinormalisasi)
const ALIASES = {
  thu: "travelhajiumroh", // THU = Travel Haji Umroh
  bolupisangbuwinda: "bolukukis", // Bolu Pisang Bu Winda = Bolu Kukis
};
const STOP_TOKENS = new Set(["studio"]); // kata generik yang diabaikan saat token matching
const tokens = (s) => (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP_TOKENS.has(t));

const findClient = (raw) => {
  const n = norm(raw);
  if (!n) return null;
  // 1) Alias manual (akronim / nama beda total)
  if (ALIASES[n] && clientMap[ALIASES[n]]) return clientMap[ALIASES[n]];
  // 2) Exact setelah normalisasi
  if (clientMap[n]) return clientMap[n];
  // 3) Kontains dua arah (mis. "YourBestDeal" → "Yourbestdeal")
  for (const [k, v] of Object.entries(clientMap)) if (k.includes(n) || n.includes(k)) return v;
  // 4) Token-subset: semua kata client ada di nama tab (mis. "RMODA Studio Workshop" → "RMODA Workshop")
  const t = new Set(tokens(raw));
  let best = null, bestLen = 0;
  for (const v of Object.values(clientMap)) {
    const ct = tokens(v.name);
    if (ct.length >= 2 && ct.every((w) => t.has(w)) && ct.length > bestLen) { best = v; bestLen = ct.length; }
  }
  return best;
};

const now = new Date();
const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}`;
const year = now.getFullYear();

const report = [];
let totalOkrs = 0, totalPrin = 0, totalInit = 0, totalTL = 0, unmatched = 0, dupes = [], createdList = [];

for (const tab of tabs) {
  const csv = await (await fetch(`https://docs.google.com/spreadsheets/d/e/${base}/pub?output=csv&gid=${tab.gid}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" } })).text();
  const parsed = parseTab(csv);
  let client = findClient(tab.name);
  let created = false;
  if (!client && createMissing && !dryRun) {
    const slug = tab.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const { data: nc, error } = await supabase
      .from("clients")
      .insert({ name: tab.name, slug, industry: "Other", status: "inactive", services: [] })
      .select("id, name")
      .single();
    if (nc) { client = nc; created = true; clientMap[norm(nc.name)] = nc; createdList.push(nc.name); }
    else console.error(`    ❌ buat client gagal: ${error?.message}`);
  }
  const label = client ? `→ ${client.name}${created ? " 🆕" : ""}` : createMissing ? `→ 🆕 [akan dibuat] ${tab.name}` : "→ ⚠️ TIDAK MATCH";
  if (!client) unmatched++;
  const dup = client && report.some((r) => r.clientId === client.id);
  if (dup) dupes.push(tab.name);

  const line = `${tab.name} ${label} | OKR:${parsed.okrs.length} 4M:${parsed.principles.length} Initiatives:${parsed.initiatives.length} Timeline:${parsed.timeline.length}${parsed.profile ? " +profile" : ""}`;
  console.log(`  ${line}`);
  report.push({ tab: tab.name, clientId: client?.id, clientName: client?.name, parsed, dup });
  totalOkrs += parsed.okrs.length; totalPrin += parsed.principles.length; totalInit += parsed.initiatives.length; totalTL += parsed.timeline.length;

  if (!dryRun && client && !dup) {
    // Replace data lama client ini
    await supabase.from("okrs").delete().eq("client_id", client.id);
    await supabase.from("client_principles").delete().eq("client_id", client.id);
    await supabase.from("client_initiatives").delete().eq("client_id", client.id);

    if (parsed.okrs.length) {
      const { error } = await supabase.from("okrs").insert(parsed.okrs.map((o) => ({
        client_id: client.id, objective: o.objective, key_result: o.key_result,
        quarter, year, baseline_value: 0, actual_value: 0, kr_type: "lagging", progress_pct: 0, status: "behind",
      })));
      if (error) console.error(`    ❌ okrs: ${error.message}`);
    }
    if (parsed.principles.length) {
      const { error } = await supabase.from("client_principles").insert(parsed.principles.map((p, i) => ({
        client_id: client.id, category: p.category, description: p.description, sort_order: i,
      })));
      if (error) console.error(`    ❌ principles: ${error.message}`);
    }
    if (parsed.initiatives.length) {
      const { error } = await supabase.from("client_initiatives").insert(parsed.initiatives.map((n, i) => ({
        client_id: client.id, description: n.description, tag: n.tag, status: "planned", sort_order: i,
      })));
      if (error) console.error(`    ❌ initiatives: ${error.message}`);
    }
  } else if (!dryRun && client && dup) {
    console.log(`    ⏭️  Skip (duplikat match ke client yang sama dengan tab sebelumnya)`);
  }
}

console.log("\n📊 RINGKASAN:");
console.log(`  Tab: ${tabs.length} | Match: ${tabs.length - unmatched} | Tidak match: ${unmatched}`);
console.log(`  Total: OKR=${totalOkrs}, 4M=${totalPrin}, Initiatives=${totalInit}, Timeline=${totalTL} (timeline hanya dilaporkan, tidak diimport)`);
if (dupes.length) console.log(`  ⚠️ Tab duplikat (match ke client sama): ${dupes.join(", ")}`);
if (createdList.length) console.log(`  🆕 Client baru dibuat: ${createdList.join(", ")}`);
if (dryRun) console.log("\n🔍 DRY RUN — tidak ada data ditulis. Jalankan tanpa --dry-run untuk import asli.");
else console.log("\n✅ Import selesai — cek halaman /strategy (titik hijau 'punya canvas').");