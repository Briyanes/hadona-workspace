#!/usr/bin/env node
/**
 * import-ads-creative-master-v2.mjs — v2 (XLSX-based, auto-discover)
 *
 * Perbaikan vs v1 (import-ads-creative-master.mjs):
 *  1. SATU download XLSX publish (tanpa daftar gid manual — sheet baru
 *     otomatis ter-import; v1 hanya 20 sheet, sheet lain terlewat).
 *  2. Header matching fleksibel: "Prefilled (Copy) (If Use CTWA Campaign)"
 *     dikenali (v1 exact-match "prefilled (copy)" → gagal → data hilang).
 *  3. Filter noise kolom (Copy): nilai angka murni (post-ID 557/787/…)
 *     tidak dianggap caption.
 *  4. hasReal memperhitungkan caption/prefilled — baris yang hanya punya
 *     caption (dropdown semua placeholder) tetap di-import.
 *  5. Patch per-kolom: nilai baru valid → tulis; null → preserve nilai DB
 *     (tidak pernah menimpa nilai real dengan null, tidak menyimpan
 *     placeholder "Copy di Note" / "Paste Disini").
 *  6. TIDAK menghapus row apa pun (safe-upsert saja).
 *  7. Dedup 3 level: (source_sheet, xlsxRow-1) konvensi CSV lama →
 *     (source_sheet, xlsxRow) konvensi notes-import → content signature
 *     (source_sheet + theme + result_link).
 *
 * Usage:
 *   node scripts/import-ads-creative-master-v2.mjs --dry-run
 *   node scripts/import-ads-creative-master-v2.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
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

const PUBLISH_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvBoDAzpSZytQONIf9KCAcwqWJWeMhEAgdOzM_yrxyBJTt6NO4BdiiayBT21qyy_juEks6WwqZzBlU/pub";

// Alias nama sheet (publish) → nama klien di tabel clients
const CLIENT_ALIAS = {
  "RMODA studio Makasar": "RMODA Studio Makassar",
  "RMODA studio BSD": "RMODA Studio BSD",
  "RMODA autospa Kelapa Gading": "RMODA Autospa Kelapa Gading",
  YBD: "Yourbestdeal",
  "EJA Tour & Travel": "EJA Tour and Travel",
  Shumijapan: "SHUMI Japan",
  "Treetop Game": "Tree Top Game",
  "Tape Ketan 181 Muntilan": "Tape Ketan 181",
  "Ocean Rent & Travel Car": "OCEAN Transport",
  "Hadona agency": "Hadona Digital Media",
  // Duplikat hasil merge 2026-08-24 (lihat scripts/merge-duplicate-clients.mjs)
  "Seminar Kulit": "Seminar Kit",
  "Kurma Ayyuwa": "AYYUWA Store",
  "Bolu Pisang bu Winda": "Bolu Kukis",
};

// ============================================================
// HELPERS
// ============================================================
const AMP = String.fromCharCode(38);
const decodeXml = (s) =>
  String(s)
    .split(AMP + "amp;").join(AMP)
    .split(AMP + "lt;").join("<")
    .split(AMP + "gt;").join(">")
    .split(AMP + "quot;").join('"')
    .split(AMP + "#39;").join("'")
    .split(AMP + "apos;").join("'");

const clean = (v) => {
  if (v == null) return null;
  const t = String(v).replace(/\u00a0/g, " ").trim();
  if (t === "" || t === "-" || t === "—") return null;
  return t;
};

// Placeholder dropdown ("Pilih Disini") — untuk kolom pilihan
const isDropdownPh = (v) => !v || /^pilih\s*disini/i.test(String(v).trim());

// Placeholder kolom caption/prefilled/angle: instruksi, bukan konten
const isCaptionPh = (v) =>
  !v ||
  /^paste\s*disini/i.test(String(v).trim()) ||
  /^pilih\s*disini/i.test(String(v).trim()) ||
  /^(copy|lihat|cek|ada|baca)\s*di\s*notes?$/i.test(String(v).trim()) ||
  /^di\s*notes?$/i.test(String(v).trim()) ||
  /^see\s*notes?$/i.test(String(v).trim());

// Noise kolom (Copy): angka murni = post-ID hasil ekstraksi note yang salah
const isNoise = (v) => /^\d+$/.test(String(v).trim());

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

function parseDate(v) {
  const t = clean(v);
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})(?!\d)/.exec(t); // d/m/yy → 20yy
  if (m) return `20${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t); // dd/mm/yyyy
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  // serial XLSX (5 digit, abaikan fraksi waktu)
  const serial = /^(\d{5})(?:\.\d+)?$/.exec(t);
  if (serial) {
    const d = new Date(Math.round((Number(serial[1]) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  const d = new Date(t);
  if (!isNaN(d.getTime())) {
    const iso = d.toISOString().split("T")[0];
    // tolak tanggal nonsense (mis. "22/9/26" → tahun 26/389) — upload ads pasti 2000-an
    const y = Number(iso.slice(0, 4));
    if (y >= 2000 && y <= 2099) return iso;
  }
  return null;
}

// ============================================================
// XLSX PARSING
// ============================================================
const TMP = path.join(os.tmpdir(), "ads_master_v2");

async function downloadXlsx() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const res = await fetch(`${PUBLISH_BASE}?output=xlsx`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(path.join(TMP, "m.xlsx"), Buffer.from(await res.arrayBuffer()));
  execSync(`unzip -oq "${path.join(TMP, "m.xlsx")}" -d "${TMP}"`);
}

function parseSharedStrings() {
  const f = path.join(TMP, "xl", "sharedStrings.xml");
  if (!fs.existsSync(f)) return [];
  const xml = fs.readFileSync(f, "utf-8");
  return (xml.match(/<si[ >][\s\S]*?<\/si>/g) || []).map((si) =>
    decodeXml((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]*>/g, "")).join(""))
  );
}

/** workbook.xml + rels → [{ name, file }] */
function parseWorkbook() {
  const wb = fs.readFileSync(path.join(TMP, "xl", "workbook.xml"), "utf-8");
  const relsXml = fs.readFileSync(path.join(TMP, "xl", "_rels", "workbook.xml.rels"), "utf-8");
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const tgt = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && tgt) relMap[id] = tgt;
  }
  const out = [];
  for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
    const name = decodeXml(/name="([^"]+)"/.exec(m[0])?.[1] || "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid || !relMap[rid]) continue;
    const t = relMap[rid].replace(/^\//, "");
    const p = t.startsWith("xl/") ? path.join(TMP, t) : path.join(TMP, "xl", t);
    if (fs.existsSync(p)) out.push({ name, file: p });
  }
  return out;
}

/** worksheet XML → Map(rowNum → Map(colLetter → text)) */
function parseSheetCells(file, shared) {
  const xml = fs.readFileSync(file, "utf-8");
  const rows = new Map();
  for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    for (const cm of rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cm[1])?.[1];
      if (!ref) continue;
      const ty = /t="([^"]*)"/.exec(cm[1])?.[1] || "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];
      let text = null;
      if (ty === "s" && v != null) text = shared[Number(v)] ?? null;
      else if (ty === "inlineStr") text = decodeXml((cm[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
      else if (v != null) text = v;
      if (text != null) cells.set(ref, String(text).trim());
    }
    if (cells.size) rows.set(Number(rm[1]), cells);
  }
  return rows;
}

/** worksheet hyperlinks: file → Map(rowNum → url) */
function parseSheetLinks(file) {
  const out = new Map();
  const relsF = path.join(path.dirname(file), "_rels", path.basename(file) + ".rels");
  if (!fs.existsSync(relsF)) return out;
  const relsXml = fs.readFileSync(relsF, "utf-8");
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const tgt = /Target="([^"]+)"/.exec(m[0])?.[1];
    const mode = /TargetMode="External"/.test(m[0]);
    if (id && tgt && mode) relMap[id] = decodeXml(tgt);
  }
  const xml = fs.readFileSync(file, "utf-8");
  for (const m of xml.matchAll(/<hyperlink\s([^>]*)\/?>/g)) {
    const ref = /ref="([A-Z]+)(\d+)"/.exec(m[1]);
    const rid = /r:id="([^"]+)"/.exec(m[1])?.[1];
    if (!ref || !rid || !relMap[rid]) continue;
    out.set(Number(ref[2]), relMap[rid]);
  }
  return out;
}

// ============================================================
// HEADER DETECTION (fleksibel, case-insensitive)
// ============================================================
/** cari baris header & peta jenis-kolom → huruf kolom */
function detectHeader(rowsMap) {
  const rowNums = [...rowsMap.keys()].sort((a, b) => a - b).slice(0, 12);
  for (const rn of rowNums) {
    const cells = rowsMap.get(rn);
    const cols = {};
    for (const [col, raw] of cells) {
      const h = String(raw).toLowerCase().replace(/\s+/g, " ").trim();
      if (/^status$/.test(h)) cols.status = col;
      else if (/^tanggal$/.test(h)) cols.tanggal = col;
      else if (/^objective/.test(h)) cols.objective = col;
      else if (/^funnel$/.test(h)) cols.funnel = col;
      else if (/^format$/.test(h)) cols.format = col;
      else if (/^angle/.test(h)) cols.angle = col;
      else if (/^content\s*link$/.test(h)) cols.linkMain = col;
      else if (/^content\s*link[\s\S]*\(url\)/.test(h)) cols.linkUrl = col;
      else if (/^caption$/.test(h)) cols.capMain = col;
      else if (/^caption\s*\(copy\)$/.test(h)) cols.capCopy = col;
      else if (/^prefilled/.test(h) && /\(copy\)/.test(h)) cols.preCopy = col;
      else if (/^prefilled/.test(h)) cols.preMain = col;
    }
    if (cols.capMain && (cols.preMain || cols.capCopy)) return { headerRow: rn, cols };
  }
  return null;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no writes\n" : "🚀 Import MASTER Ads Creative v2 (XLSX, auto-discover)\n");

  // --- 0. Probe kolom ---
  const { error: probeErr } = await supabase
    .from("ads_content_clusters")
    .select("progress, pillar, details, content_copy, source_sheet, sheet_row, client_hint")
    .limit(1);
  if (probeErr) {
    console.error("❌ Probe gagal:", probeErr.message);
    process.exit(1);
  }

  // --- 1. Download & parse XLSX ---
  await downloadXlsx();
  const shared = parseSharedStrings();
  const sheets = parseWorkbook();
  console.log(`Workbook: ${sheets.length} sheet\n`);

  // --- 2. Clients ---
  const { data: clients } = await supabase.from("clients").select("id, name");
  const clientList = clients || [];
  const findClient = (sheetName) => {
    const target = CLIENT_ALIAS[sheetName] || sheetName;
    const n = norm(target);
    const exact = clientList.find((c) => norm(c.name) === n);
    if (exact) return exact.id;
    const partials = clientList.filter((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
    if (partials.length === 1) return partials[0].id;
    if (partials.length > 1) {
      // pilih nama terpendek (paling spesifik) — hindari Nouban ⊂ Nouban CPAS
      partials.sort((a, b) => norm(a.name).length - norm(b.name).length);
      return partials[0].id;
    }
    return null;
  };

  // --- 3. Existing rows (master|...) untuk dedup ---
  const { data: existing } = await supabase
    .from("ads_content_clusters")
    .select("*")
    .like("source_sheet", "master|%");
  const byRow = new Map();        // sourceSheet#sheet_row (nilai apapun konvensinya)
  const bySignature = new Map();  // sheet|theme|result_link
  for (const r of existing || []) {
    if (!byRow.has(`${r.source_sheet}#${r.sheet_row}`)) byRow.set(`${r.source_sheet}#${r.sheet_row}`, r);
    if (r.theme != null) {
      const sig = `${r.source_sheet}|${norm(r.theme)}|${r.result_link || ""}`;
      if (!bySignature.has(sig)) bySignature.set(sig, r);
    }
  }

  let T = { ins: 0, upd: 0, skip: 0, noClient: 0, skippedSheets: 0, fixedCap: 0, fixedPre: 0, fixedLink: 0 };
  const unmatchedClients = new Set();

  for (const s of sheets) {
    const name = s.name.trim();
    if (/^x\s/i.test(name)) { T.skippedSheets++; continue; } // arsip

    const rowsMap = parseSheetCells(s.file, shared);
    const header = detectHeader(rowsMap);
    if (!header) { T.skippedSheets++; continue; } // bukan sheet ads creative

    const links = parseSheetLinks(s.file);
    const clientId = findClient(name);
    if (!clientId) { T.noClient++; unmatchedClients.add(name); }

    const sourceSheet = `master|${name}`;
    let ins = 0, upd = 0, skip = 0, fixedCap = 0, fixedPre = 0, fixedLink = 0;
    const claimed = new Set(); // 1 DB row hanya boleh diklaim 1 baris sheet (anti-osilasi r5/r6)

    for (const [rn, cells] of rowsMap) {
      if (rn <= header.headerRow) continue;
      const c = header.cols;
      const g = (col) => (col ? clean(cells.get(col)) : null);

      const status = g(c.status);
      const funnel = g(c.funnel);
      const format = g(c.format);
      const objective = g(c.objective);
      // Angle berisi angka murni ("30") pada baris template XLSX —
      // itu jumlah konten request, bukan angle nyata (CSV publish kosong).
      const angleRaw = g(c.angle);
      const angle =
        angleRaw && !isNoise(angleRaw) && !isCaptionPh(angleRaw) ? angleRaw : null;
      const tanggal = g(c.tanggal);

      // caption: (Copy) prioritas; angka murni = noise post-ID (di kolom utama MAUPUN (Copy))
      const capCopyRaw = g(c.capCopy);
      const capCopy = capCopyRaw && !isCaptionPh(capCopyRaw) && !isNoise(capCopyRaw) ? capCopyRaw : null;
      const capMain = g(c.capMain);
      const capMainV = capMain && !isCaptionPh(capMain) && !isNoise(capMain) ? capMain : null;
      const realCaption = capCopy || capMainV;

      const preCopyRaw = g(c.preCopy);
      const preCopy = preCopyRaw && !isCaptionPh(preCopyRaw) && !isNoise(preCopyRaw) ? preCopyRaw : null;
      const preMain = g(c.preMain);
      const preMainV = preMain && !isCaptionPh(preMain) && !isNoise(preMain) ? preMain : null;
      const realPrefilled = preCopy || preMainV;

      // link: URL teks (kolom Apps Script) → hyperlink XLSX → null
      const linkUrlText = g(c.linkUrl);
      const linkUrl = linkUrlText && /^https?:\/\//i.test(linkUrlText) ? linkUrlText : null;
      const hyper = links.get(rn);
      const result_link = linkUrl || (hyper && /^https?:\/\//i.test(hyper) ? hyper : null);

      // baris valid?
      const hasReal =
        !isDropdownPh(status) ||
        !isDropdownPh(funnel) ||
        !isDropdownPh(format) ||
        !isDropdownPh(objective) ||
        angle != null ||
        result_link != null ||
        realCaption != null ||
        realPrefilled != null;
      if (!hasReal) continue;

      const payload = {
        progress: isDropdownPh(status) ? null : status,
        pillar: isDropdownPh(funnel) ? null : funnel,
        details: isDropdownPh(objective) ? null : objective,
        format_type: isDropdownPh(format) ? null : format,
        theme: angle,
        result_link,
        caption: realCaption,
        content_copy: realPrefilled,
        upload_date: parseDate(tanggal),
      };

      // Dedup 3 level: konvensi CSV lama (row = xlsxRow-1) → konvensi
      // notes-import (row = xlsxRow) → signature konten.
      const csvOrdinal = rn - 1;
      let ex = byRow.get(`${sourceSheet}#${csvOrdinal}`);
      if (ex && claimed.has(ex.id)) ex = null;
      let usedKey = ex ? `csv#${csvOrdinal}` : null;
      if (!ex) {
        const cand = byRow.get(`${sourceSheet}#${rn}`);
        if (cand && !claimed.has(cand.id)) { ex = cand; usedKey = `xlsx#${rn}`; }
      }
      if (!ex && payload.theme != null) {
        const sig = `${sourceSheet}|${norm(payload.theme)}|${payload.result_link || ""}`;
        const cand = bySignature.get(sig) || null;
        if (cand && !claimed.has(cand.id)) ex = cand;
      }
      if (ex) claimed.add(ex.id);

      if (ex) {
        // Patch per-kolom: tulis hanya jika nilai baru valid & beda
        const patch = {};
        const keys = ["progress", "pillar", "details", "format_type", "theme", "result_link", "caption", "content_copy", "upload_date"];
        for (const k of keys) {
          const nv = payload[k] ?? null;
          const ov = ex[k] ?? null;
          if (nv !== null && nv !== ov) {
            patch[k] = nv;
            if (k === "caption") fixedCap++;
            if (k === "content_copy") fixedPre++;
            if (k === "result_link") fixedLink++;
          }
        }
        if (Object.keys(patch).length) {
          if (DRY_RUN) {
            console.log(`   ~ ${name} r${rn} (key=${usedKey || "sig"}): ${Object.keys(patch).join(",")}`);
            upd++;
          } else {
            patch.updated_at = new Date().toISOString();
            const { error } = await supabase.from("ads_content_clusters").update(patch).eq("id", ex.id);
            if (error) console.error(`   ❌ update ${name} r${rn}: ${error.message}`);
            else upd++;
          }
        } else skip++;
      } else {
        const full = { ...payload, client_id: clientId, client_hint: name, source_sheet: sourceSheet, sheet_row: rn };
        if (DRY_RUN) {
          console.log(`   + ${name} r${rn}: ${payload.theme?.slice(0, 40) || payload.caption?.slice(0, 40) || payload.result_link?.slice(0, 40) || "—"}`);
          ins++;
        } else {
          const { error } = await supabase.from("ads_content_clusters").insert(full);
          if (error) console.error(`   ❌ insert ${name} r${rn}: ${error.message}`);
          else {
            ins++;
            byRow.set(`${sourceSheet}#${rn}`, { id: `new-${rn}`, ...full });
            claimed.add(`new-${rn}`);
          }
        }
      }
    }
    T.ins += ins; T.upd += upd; T.skip += skip;
    T.fixedCap += fixedCap; T.fixedPre += fixedPre; T.fixedLink += fixedLink;
    console.log(`${name}: ${ins} insert, ${upd} update, ${skip} unchanged${clientId ? "" : " (⚠️ client null)"}`);
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}✅ Total: ${T.ins} insert, ${T.upd} update, ${T.skip} unchanged | caption fixed: ${T.fixedCap}, prefilled fixed: ${T.fixedPre}, link fixed: ${T.fixedLink} | sheet dilewati (arsip/non-ads): ${T.skippedSheets}`);
  if (unmatchedClients.size) {
    console.log(`\n⚠️ Sheet tanpa client_id (client_hint saja): ${[...unmatchedClients].join(", ")}`);
  }
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});