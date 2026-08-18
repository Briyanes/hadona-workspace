#!/usr/bin/env node
/**
 * Import Client Strategy Canvas dari published Google Sheet (service role).
 * Usage:
 *   node scripts/import-strategy-sheet.mjs <sheetUrl> [--dry-run]
 *
 * Membaca konfigurasi dari .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Tab dikenali: Sosmed, Kompetitor, 4M/Principles, Initiatives/Strategy, OKR.
 * Setiap tab harus punya kolom "Client". Data lama per-client di-replace.
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
if (!sheetUrl || !sheetUrl.includes("docs.google.com")) {
  console.error("Usage: node scripts/import-strategy-sheet.mjs <sheetUrl> [--dry-run]");
  process.exit(1);
}

// ---- helpers (mirror of API route) ----
const extractBase = (u) => (u.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/) || u.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1] || null;

function extractGids(html) {
  const sheets = [];
  const seen = new Set();
  let m;
  const re1 = /"gid":"(\d+)","sheetName":"([^"]+)"/g;
  while ((m = re1.exec(html))) if (!seen.has(m[1])) { seen.add(m[1]); sheets.push({ name: m[2].trim(), gid: m[1] }); }
  if (!sheets.length) {
    const re2 = /<a[^>]*gid=(\d+)[^>]*>([^<]+)<\/a>/gi;
    while ((m = re2.exec(html))) if (!seen.has(m[1]) && m[2].trim()) { seen.add(m[1]); sheets.push({ name: m[2].trim(), gid: m[1] }); }
  }
  return sheets;
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

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const toRows = (csv) => {
  const g = parseCsv(csv);
  if (g.length < 2) return [];
  const h = g[0].map((x) => x.trim().toLowerCase());
  return g.slice(1).map((cells) => { const o = {}; h.forEach((k, i) => (o[k] = (cells[i] || "").trim())); return o; });
};
const num = (v) => { if (!v) return null; const c = v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."); const n = parseFloat(c); return isNaN(n) ? null : n; };
const intNum = (v) => { const n = num(v); return n === null ? null : Math.round(n); };
const pick = (row, ...keys) => { for (const k of keys) { const hit = Object.keys(row).find((h) => h.includes(k)); if (hit && row[hit]) return row[hit]; } return undefined; };
const platform = (v) => { const p = (v || "").toLowerCase(); if (p.includes("ig") || p.includes("insta")) return "instagram"; if (p.includes("tt") || p.includes("tik")) return "tiktok"; if (p.includes("fb")) return "facebook"; if (p.includes("yt")) return "youtube"; if (p.includes("wa") || p.includes("whats")) return "whatsapp"; return p || "unknown"; };
const category = (v) => { const c = (v || "").toLowerCase(); if (c.includes("man")) return "manpower"; if (c.includes("tool") || c.includes("material")) return "tools"; if (c.includes("budget") || c.includes("dana")) return "budget"; return "mindset"; };

// ---- main ----
const base = extractBase(sheetUrl);
if (!base) { console.error("❌ URL tidak valid"); process.exit(1); }

console.log(`\n🌐 Fetching: ${base}${dryRun ? " (DRY RUN)" : ""}`);
const html = await (await fetch(`https://docs.google.com/spreadsheets/d/e/${base}/pubhtml`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" } })).text();
const gids = extractGids(html);
if (!gids.length) { console.error("❌ Sheet tidak ditemukan — pastikan sudah publish"); process.exit(1); }
console.log(`📋 Tabs: ${gids.map((g) => g.name).join(", ")}`);

const csvs = await Promise.all(
  gids.map((g) => fetch(`https://docs.google.com/spreadsheets/d/e/${base}/pub?output=csv&gid=${g.gid}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; HadonaBot/1.0)" } }).then((r) => r.text()))
);

const { data: clients } = await supabase.from("clients").select("id, name");
const clientMap = {};
for (const c of clients || []) clientMap[norm(c.name)] = c.id;
const findClient = (raw) => { const n = norm(raw || ""); if (!n) return null; if (clientMap[n]) return clientMap[n]; for (const [k, id] of Object.entries(clientMap)) if (k.includes(n) || n.includes(k)) return id; return null; };

const summaries = [];
async function importTab(label, csv, write) {
  try {
    const rows = toRows(csv);
    if (!rows.length) return;
    const byClient = new Map();
    let skipped = 0;
    for (const row of rows) {
      const id = findClient(pick(row, "client", "brand", "klien"));
      if (!id) { skipped++; continue; }
      if (!byClient.has(id)) byClient.set(id, []);
      byClient.get(id).push(row);
    }
    if (dryRun) {
      let t = 0; byClient.forEach((r) => (t += r.length));
      summaries.push({ sheet: label, imported: t, skipped });
      return;
    }
    let imported = 0;
    for (const id of Array.from(byClient.keys())) imported += (await write(id, byClient.get(id))).imported;
    summaries.push({ sheet: label, imported, skipped });
  } catch (err) {
    summaries.push({ sheet: label, imported: 0, skipped: 0, error: String(err.message || err) });
  }
}

const idx = (re) => gids.findIndex((g) => re.test(g.name));

const iS = idx(/sosmed|social/i);
if (iS >= 0) await importTab("Sosmed", csvs[iS], async (cid, rows) => {
  await supabase.from("client_social_accounts").delete().eq("client_id", cid);
  let n = 0;
  for (const r of rows) {
    const { error } = await supabase.from("client_social_accounts").upsert({
      client_id: cid, platform: platform(pick(r, "platform", "sosmed", "akun") || "instagram"),
      handle: pick(r, "handle", "username", "akun") || null, url: pick(r, "url", "link") || null,
      followers: intNum(pick(r, "follower")) || 0, ads_connected: /ya|yes|true|✓|1/i.test(pick(r, "ads") || ""),
      notes: pick(r, "note", "catatan") || null,
    }, { onConflict: "client_id,platform" });
    if (error) throw error; n++;
  }
  return { imported: n };
});

const iC = idx(/kompetitor|competitor|benchmark/i);
if (iC >= 0) await importTab("Kompetitor", csvs[iC], async (cid, rows) => {
  await supabase.from("client_competitors").delete().eq("client_id", cid);
  let n = 0;
  for (const r of rows) {
    const name = pick(r, "kompetitor", "competitor", "name", "nama");
    if (!name) continue;
    const { error } = await supabase.from("client_competitors").insert({
      client_id: cid, name, platform: platform(pick(r, "platform") || "instagram"),
      handle: pick(r, "handle", "username") || null, followers: intNum(pick(r, "follower")) || 0,
      engagement_rate: num(pick(r, "engagement", "er")), posting_freq: pick(r, "freq", "posting", "frekuensi") || null,
      positioning: pick(r, "positioning", "kekuatan", "strength") || null, weakness: pick(r, "weakness", "kelemahan", "gap") || null,
    });
    if (error) throw error; n++;
  }
  return { imported: n };
});

const iP = idx(/4m|principle|prinsip/i);
if (iP >= 0) await importTab("Principles 4M", csvs[iP], async (cid, rows) => {
  await supabase.from("client_principles").delete().eq("client_id", cid);
  let n = 0, order = 0;
  for (const r of rows) {
    const desc = pick(r, "description", "deskripsi", "isi", "principle", "prinsip");
    if (!desc) continue;
    const { error } = await supabase.from("client_principles").insert({
      client_id: cid, category: category(pick(r, "category", "kategori", "m")), description: desc, sort_order: order++,
    });
    if (error) throw error; n++;
  }
  return { imported: n };
});

const iI = idx(/initiative|inisiatif|strategy|strategi/i);
if (iI >= 0) await importTab("Initiatives", csvs[iI], async (cid, rows) => {
  await supabase.from("client_initiatives").delete().eq("client_id", cid);
  let n = 0, order = 0;
  for (const r of rows) {
    const desc = pick(r, "initiative", "inisiatif", "description", "deskripsi", "strategy", "strategi");
    if (!desc || /^(description|deskripsi|initiative|inisiatif|strategy|strategi|no|tag|tipe|type)$/i.test(desc.trim())) continue;
    const tag = (pick(r, "tag", "tipe", "type") || "ADS").toUpperCase();
    const { error } = await supabase.from("client_initiatives").insert({
      client_id: cid, description: desc, tag: tag.includes("SM") ? "SM" : "ADS", status: "planned", sort_order: order++,
    });
    if (error) throw error; n++;
  }
  return { imported: n };
});

const iO = idx(/okr/i);
if (iO >= 0) await importTab("OKR", csvs[iO], async (cid, rows) => {
  await supabase.from("okrs").delete().eq("client_id", cid);
  let n = 0;
  const now = new Date();
  const quarter = `Q${Math.floor(now.getMonth() / 3) + 1}`;
  const year = now.getFullYear();
  for (const r of rows) {
    const objective = pick(r, "objective", "objektif", "tujuan");
    if (!objective) continue;
    const { error } = await supabase.from("okrs").insert({
      client_id: cid, objective, key_result: pick(r, "key_result", "key result", "kr") || null,
      quarter: pick(r, "quarter", "q") || quarter, year: intNum(pick(r, "year", "tahun")) || year,
      target_value: num(pick(r, "target")), baseline_value: num(pick(r, "baseline", "base")) ?? 0,
      actual_value: num(pick(r, "actual")) ?? 0, unit: pick(r, "unit", "satuan") || null,
      metric_name: pick(r, "metric", "metrik") || null,
      kr_type: /lead/i.test(pick(r, "type", "tipe") || "") ? "leading" : "lagging",
      progress_pct: 0, status: "behind",
    });
    if (error) throw error; n++;
  }
  return { imported: n };
});

console.log("\n📊 HASIL:");
for (const s of summaries) {
  console.log(`  ${s.error ? "❌" : "✅"} ${s.sheet}: ${s.imported} imported, ${s.skipped} skipped${s.error ? ` — ${s.error}` : ""}`);
}
if (!summaries.length) console.log("  ⚠️  Tidak ada tab strategy yang dikenali.");
if (dryRun) console.log("\n🔍 DRY RUN — tidak ada data yang ditulis. Jalankan tanpa --dry-run untuk import asli.");