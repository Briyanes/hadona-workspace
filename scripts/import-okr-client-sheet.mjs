#!/usr/bin/env node
/**
 * Import "Objective Key Result Client" sheet (format: 1 tab = 1 client).
 * Setiap tab berisi section (format lama ATAU baru section-aware):
 *   - Objective Key Result Summary → okrs
 *   - No|Category|Description (4M)  → client_principles
 *   - Strategy and KPI (SM|/ADS|)  → client_initiatives
 *   - Timeline and Key Actions     → hanya dilaporkan (tidak diimport)
 * Format baru (mis. Moone Bakery / EJA Tour), label di kolom A/B:
 *   - Client Profile,,<nama> + ,,"Description" + ,,<deck/url> → profil
 *   - Client Services,,"Content Production, SMM, ..."         → clients.services
 *   - Client Competitor,,No,Description → ,,N,<url/nama>      → client_competitors
 *   - Objective Key Result Summary → <Objective>,,No,Description(s) → ,,N,<KR>
 *   - Tabel SOP (kolom F+) & TOF/MOF/BOF diabaikan (overlap kolom)
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
// Baris berakhiran ":" dianggap judul → digabung ke tiap item di bawahnya
// (mis. "Menyelesaikan Pembuatan:" + "- 150 Raw Photo" → "Menyelesaikan Pembuatan 150 Raw Photo").
function splitKeyResults(raw) {
  const lines = String(raw || "")
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
  const out = [];
  let prefix = "";
  for (const l of lines) {
    if (/:$/.test(l) && l.length <= 60) { prefix = `${l.replace(/:$/, "").trim()} `; continue; }
    out.push(prefix && !l.toLowerCase().startsWith(prefix.trim().toLowerCase()) ? prefix + l : l);
  }
  return out.length ? out : lines;
}
const category = (v) => {
  const c = (v || "").toLowerCase();
  if (c.includes("man")) return "manpower";
  if (c.includes("tool")) return "tools";
  if (c.includes("budget") || c.includes("dana")) return "budget";
  return "mindset";
};
const tagOf = (desc) => (/^\s*sm\b/i.test(desc) ? "SM" : "ADS");

// ---- parse satu tab client → sections (format lama + format baru section-aware) ----
function parseTab(csv) {
  const rows = parseCsv(csv);
  const out = { okrs: [], principles: [], initiatives: [], timeline: [], profile: null, services: "", competitors: [] };
  const seenOkr = new Set();
  const pushOkr = (obj, kr) => {
    for (const part of splitKeyResults(kr)) {
      const key = `${norm(obj)}|${norm(part)}`;
      if (seenOkr.has(key)) continue; // dedupe KR identik (marker ganda / sel repetitif)
      seenOkr.add(key);
      out.okrs.push({ objective: obj, key_result: part });
    }
  };

  // Format lama: deteksi baris header tabel
  let legacy = null;
  let headers = [];
  const isHeader = (r) => {
    const j = r.map((c) => clean(c).toLowerCase()).join("|");
    if (j.includes("objective") && j.includes("key result") && !/^objective key result/.test(j)) return "okr";
    if (/^no\|/.test(j) && j.includes("category") && j.includes("description")) return "principles";
    if (/^no\|/.test(j) && j.startsWith("no|description")) return "initiatives";
    if (/^no\|/.test(j) && j.includes("key action")) return "timeline";
    return null;
  };

  // Format baru: state machine section-aware
  let mode = null; // "profile-desc" | "okr-title" | "okr-kr" | "competitor"
  let objective = null;
  let profileDescNext = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const a = clean(r[0]), b = clean(r[1]), c = clean(r[2]), d = clean(r[3]);
    const label = a || b;

    // --- Marker section format baru ---
    if (/^objective key result/i.test(label)) { mode = "okr-title"; legacy = null; objective = null; continue; }
    if (/^client competitor/i.test(label)) { mode = "competitor"; legacy = null; continue; }
    if (/^client services/i.test(label)) {
      const nx = rows[i + 1] || [];
      const svc = c || clean(nx[1]) || clean(nx[2]);
      if (svc && !/^no$/i.test(svc)) out.services = svc;
      mode = null; legacy = null; continue;
    }
    if (/^client profile/i.test(label)) {
      if (c) out.profile = { description: "", name: c }; // format baru: nama client di kolom C baris sama
      else {
        const nx = rows[i + 1] || [];
        if (clean(nx[1]) || clean(nx[2])) out.profile = { description: clean(nx[1]), services: clean(nx[2]) };
      }
      mode = "profile-desc"; legacy = null; continue;
    }
    if (/^(strategy|timeline)/i.test(a)) { mode = null; legacy = null; continue; } // judul blok non-data di kolom A

    // --- Deteksi header tabel (4M / Timeline / sheet lama) ---
    // Harus SEBELUM state machine: cegah header "No,Category,No,Description" (section Principles)
    // salah dikenali sebagai "judul objektif berikutnya" saat mode masih okr-kr.
    const hh = isHeader(r);
    if (hh) { legacy = hh; headers = r.map((x) => clean(x).toLowerCase()); mode = null; objective = null; continue; }

    // --- State format baru ---
    if (mode === "profile-desc") {
      if (c.toLowerCase().startsWith("description") && !a) { profileDescNext = true; continue; }
      if (profileDescNext && c && !/^no$/i.test(c)) {
        if (out.profile) out.profile.description = out.profile.description || c;
        profileDescNext = false; mode = null; continue;
      }
      if (a || b || c) { profileDescNext = false; mode = null; }
      continue;
    }
    if (mode === "okr-title") {
      if (!a && !b && !c && !d) continue; // tunggu baris judul objektif
      if (/^no$/i.test(c) && /^description/i.test(d)) { objective = a; mode = "okr-kr"; }
      continue;
    }
    if (mode === "okr-kr") {
      // Judul objektif berikutnya (defensif): pola "<Judul>,,No,Description" — kolom B kosong & A bukan "No" (header tabel lain).
      if (/^no$/i.test(c) && /^description/i.test(d) && a && !/^no$/i.test(a) && !b) { objective = a; continue; }
      if (/^\d+$/.test(c) && d) pushOkr(objective || "General", d);
      continue; // baris SOP (kolom F+) / TOF/MOF/BOF terlewati otomatis (kolom C/D kosong)
    }
    if (mode === "competitor") {
      if (/^\d+$/.test(c) && d) out.competitors.push(d);
      continue;
    }

    // --- Format lama --- (header sudah terdeteksi di atas)
    if (!legacy || !r.some((x) => clean(x))) continue;
    const col = (name) => {
      const idx = headers.findIndex((x) => x.includes(name));
      return idx >= 0 ? clean(r[idx]) : "";
    };
    if (!/^\d+$/.test(col("no"))) continue; // hanya baris bernomor
    if (legacy === "okr") {
      const obj = col("objective"), kr = col("key result");
      if (obj || kr) pushOkr(obj, kr);
    } else if (legacy === "principles") {
      const cat = col("category"), desc = col("description");
      if (desc) out.principles.push({ category: category(cat), description: desc });
    } else if (legacy === "initiatives") {
      const desc = col("description");
      // "Description" literal = placeholder kolom template, bukan data
      if (desc && !/^description$/i.test(desc)) out.initiatives.push({ description: desc, tag: tagOf(desc) });
    } else if (legacy === "timeline") {
      const action = col("key action");
      if (action) out.timeline.push({ action, owner: col("process owner"), start: col("start date"), end: col("end date") });
    }
  }
  return out;
}

// Teks kompetitor (URL sosmed / nama) → payload client_competitors
function competitorFromText(text) {
  const m = String(text).match(/(instagram\.com|instagr\.am|tiktok\.com|facebook\.com|youtube\.com|twitter\.com|x\.com)\/(@?[A-Za-z0-9._]+)/i);
  if (m) {
    const platform = /tiktok/i.test(m[1]) ? "tiktok" : /facebook/i.test(m[1]) ? "facebook" : /youtube/i.test(m[1]) ? "youtube" : /twitter|x\.com/i.test(m[1]) ? "x" : "instagram";
    const handle = m[2].replace(/^@/, "");
    return { name: handle, platform, handle };
  }
  return { name: String(text).trim(), platform: null, handle: null };
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
let totalOkrs = 0, totalPrin = 0, totalInit = 0, totalTL = 0, totalComp = 0, unmatched = 0, dupes = [], createdList = [];

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

  const line = `${tab.name} ${label} | OKR:${parsed.okrs.length} 4M:${parsed.principles.length} Initiatives:${parsed.initiatives.length} Timeline:${parsed.timeline.length} Comp:${parsed.competitors.length}${parsed.services ? " +svc" : ""}${parsed.profile ? " +profile" : ""}`;
  console.log(`  ${line}`);
  report.push({ tab: tab.name, clientId: client?.id, clientName: client?.name, parsed, dup });
  totalOkrs += parsed.okrs.length; totalPrin += parsed.principles.length; totalInit += parsed.initiatives.length; totalTL += parsed.timeline.length; totalComp += parsed.competitors.length;

  if (!dryRun && client && !dup) {
    // Replace data lama client ini
    await supabase.from("okrs").delete().eq("client_id", client.id);
    await supabase.from("client_principles").delete().eq("client_id", client.id);
    await supabase.from("client_initiatives").delete().eq("client_id", client.id);
    await supabase.from("client_competitors").delete().eq("client_id", client.id);

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
    if (parsed.competitors.length) {
      const { error } = await supabase.from("client_competitors").insert(
        parsed.competitors.map((t) => ({ client_id: client.id, ...competitorFromText(t) }))
      );
      if (error) console.error(`    ❌ competitors: ${error.message}`);
    }
    const svcRaw = parsed.services || parsed.profile?.services || "";
    const svcArr = svcRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
    if (svcArr.length) {
      const { error } = await supabase.from("clients").update({ services: svcArr }).eq("id", client.id);
      if (error) console.error(`    ❌ services: ${error.message}`);
    }
  } else if (!dryRun && client && dup) {
    console.log(`    ⏭️  Skip (duplikat match ke client yang sama dengan tab sebelumnya)`);
  }
}

console.log("\n📊 RINGKASAN:");
console.log(`  Tab: ${tabs.length} | Match: ${tabs.length - unmatched} | Tidak match: ${unmatched}`);
console.log(`  Total: OKR=${totalOkrs}, 4M=${totalPrin}, Initiatives=${totalInit}, Timeline=${totalTL}, Kompetitor=${totalComp} (timeline hanya dilaporkan, tidak diimport)`);
if (dupes.length) console.log(`  ⚠️ Tab duplikat (match ke client sama): ${dupes.join(", ")}`);
if (createdList.length) console.log(`  🆕 Client baru dibuat: ${createdList.join(", ")}`);
if (dryRun) console.log("\n🔍 DRY RUN — tidak ada data ditulis. Jalankan tanpa --dry-run untuk import asli.");
else console.log("\n✅ Import selesai — cek halaman /strategy (titik hijau 'punya canvas').");