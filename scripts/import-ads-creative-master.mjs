#!/usr/bin/env node
/**
 * import-ads-creative-master.mjs
 *
 * Import "Ads Creative" dari MASTER publish spreadsheet:
 * https://docs.google.com/spreadsheets/d/e/2PACX-1vRvBoDAzpSZytQONIf9KCAcwqWJWeMhEAgdOzM_yrxyBJTt6NO4BdiiayBT21qyy_juEks6WwqZzBlU/pubhtml
 *
 * - 20 sheet tab (1 per klien) diunduh sebagai CSV per gid.
 * - Kolom master: No. | Status | Tanggal | Objective Campaign | Funnel | Format |
 *   Angle (request) | Content Link | Caption | Prefilled Message (If Use CTWA Campaign)
 *   + kolom ekstraksi Apps Script v2: Caption (Copy) | Prefilled (Copy) |
 *   Content Link (URL) — URL hyperlink tertanam via getRichTextValues
 *   (CSV publish hanya memuat teks tampilan "Link"/"Drive", bukan URL)
 * - Mapping (REUSE kolom existing, tanpa migration v97):
 *   Status→progress, Tanggal→upload_date, Objective Campaign→details,
 *   Funnel→pillar, Format→format_type, Angle→theme, Content Link→result_link,
 *   Caption→caption, Prefilled Message→content_copy
 * - Butuh kolom v96 saja (source_sheet, sheet_row, client_hint) — sudah ada.
 * - IDEMPOTENT — dedup via (source_sheet='master|<nama sheet>', sheet_row).
 * - Bersihkan row import lama (4 file legacy) saat run pertama.
 *
 * Usage:
 *   node scripts/import-ads-creative-master.mjs --dry-run
 *   node scripts/import-ads-creative-master.mjs
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

// ============================================================
// MASTER PUBLISH CONFIG — base URL + 20 sheet tab (nama → gid)
// ============================================================
const PUBLISH_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvBoDAzpSZytQONIf9KCAcwqWJWeMhEAgdOzM_yrxyBJTt6NO4BdiiayBT21qyy_juEks6WwqZzBlU/pub";

const SHEETS = [
  { sheet: "Hadona agency", gid: "37980264" },
  { sheet: "RMODA Workshop", gid: "1972753698" },
  { sheet: "RMODA studio BSD", gid: "693467431" },
  { sheet: "RMODA studio Makasar", gid: "1589198379" },
  { sheet: "RMODA autospa Kelapa Gading", gid: "586444749" },
  { sheet: "AUM Apparel", gid: "552805292" },
  { sheet: "Treetop Game", gid: "476106459" },
  { sheet: "Anurakti", gid: "1922574546" },
  { sheet: "EOP", gid: "1176540339" },
  { sheet: "Nouban", gid: "1684219729" },
  { sheet: "Tombo Ati", gid: "1825014447" },
  { sheet: "Bolu Pisang bu Winda", gid: "2124108224" },
  { sheet: "Ocean Rent & Travel Car", gid: "36807509" },
  { sheet: "Tape Ketan 181 Muntilan", gid: "586249602" },
  { sheet: "TPDOC", gid: "414355878" },
  { sheet: "YBD", gid: "1627948253" },
  { sheet: "RAHA Pro", gid: "1310908650" },
  { sheet: "Threenine", gid: "755265929" },
  { sheet: "Shumijapan", gid: "900346584" },
  { sheet: "EJA Tour & Travel", gid: "361559464" },
];

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
};

// ============================================================
// HELPERS
// ============================================================
const clean = (v) => {
  if (v == null) return null;
  const t = String(v).replace(/\u00a0/g, " ").trim();
  if (t === "" || t === "-" || t === "—") return null;
  return t;
};

const isPlaceholder = (v) => !v || /^pilih\s*disini$/i.test(String(v).trim());

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
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t); // dd/mm/yyyy
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  if (/^\d{5}$/.test(t)) {
    const d = new Date(Math.round((Number(t) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

/** RFC4180 CSV parser — handles quoted cells containing commas & newlines */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch === "\r") {
      // skip
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ============================================================
// XLSX HYPERLINK EXTRACTION — CSV publish hanya memuat teks
// tampilan hyperlink ("Link"/"Drive"); URL asli tersimpan pada
// export XLSX dari publish link (pubhtml kini JS-rendered, tidak
// lagi memuat tabel inline). Diekstrak via unzip + parse XML:
//   xl/workbook.xml → nama sheet → worksheet file (via rels)
//   xl/worksheets/sheetN.xml → <c> value + <hyperlink ref r:id>
//   xl/worksheets/_rels/sheetN.xml.rels → r:id → URL external
// ============================================================
const XLSX_TMP = path.join(os.tmpdir(), "ads_master_xlsx");

const decodeXml = (s) =>
  String(s)
    .split("&" + "amp;").join("&")
    .split("&" + "lt;").join("<")
    .split("&" + "gt;").join(">")
    .split("&" + "quot;").join('"')
    .split("&" + "apos;").join("'")
    .split("&#39;").join("'");

/** Download export XLSX publish sekali, unzip → dir */
async function downloadMasterXlsx() {
  const file = path.join(XLSX_TMP, "master.xlsx");
  fs.mkdirSync(XLSX_TMP, { recursive: true });
  const res = await fetch(`${PUBLISH_BASE}?output=xlsx`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  execSync(`unzip -oq "${file}" -d "${XLSX_TMP}"`);
  return XLSX_TMP;
}

/** sharedStrings.xml → array string (index = <v> pada cell t="s") */
function parseSharedStrings(dir) {
  const f = path.join(dir, "xl", "sharedStrings.xml");
  const arr = [];
  if (!fs.existsSync(f)) return arr;
  const xml = fs.readFileSync(f, "utf-8");
  const sis = xml.match(/<si[ >][\s\S]*?<\/si>/g) || [];
  for (const si of sis) {
    const ts = si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || [];
    arr.push(decodeXml(ts.map((t) => t.replace(/<[^>]*>/g, "")).join("")));
  }
  return arr;
}

/** workbook.xml + rels → Map(nama sheet → path worksheet xml) */
function sheetFileMap(dir) {
  const wb = fs.readFileSync(path.join(dir, "xl", "workbook.xml"), "utf-8");
  const relsXml = fs.readFileSync(path.join(dir, "xl", "_rels", "workbook.xml.rels"), "utf-8");
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const tgt = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && tgt) relMap[id] = tgt;
  }
  const map = new Map();
  for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
    const name = /name="([^"]+)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid || !relMap[rid]) continue;
    const t = relMap[rid].replace(/^\//, "");
    const p = t.startsWith("xl/") ? path.join(dir, t) : path.join(dir, "xl", t);
    map.set(decodeXml(name), p);
  }
  return map;
}

/**
 * Worksheet xml → Map(nomor baris sheet → { url, display }).
 * Baris sheet 1-based (header = 1); ordinal CSV r ↔ baris sheet r+1.
 */
function sheetHyperlinks(wsPath, shared) {
  const out = new Map();
  if (!fs.existsSync(wsPath)) return out;
  const xml = fs.readFileSync(wsPath, "utf-8");

  // Nilai cell (untuk guard teks tampilan): ref → text
  const cellText = new Map();
  for (const m of xml.matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = m[1];
    const body = m[2];
    const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!ref) continue;
    const t = /t="([^"]*)"/.exec(attrs)?.[1] || "";
    let text = null;
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (t === "s" && v != null) text = shared[Number(v)] ?? null;
    else if (t === "inlineStr") text = decodeXml((body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
    else if (v != null) text = v;
    if (text != null) cellText.set(ref, String(text));
  }

  // Hyperlink: ref + r:id → URL via worksheet rels
  const relsPath = wsPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const relMap = {};
  if (fs.existsSync(relsPath)) {
    const rx = fs.readFileSync(relsPath, "utf-8");
    for (const m of rx.matchAll(/<Relationship\s[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0])?.[1];
      const tgt = /Target="([^"]+)"/.exec(m[0])?.[1];
      if (id && tgt && /TargetMode="External"/.test(m[0])) relMap[id] = decodeXml(tgt);
    }
  }
  for (const m of xml.matchAll(/<hyperlink\s([^>]*)\/?>/g)) {
    const attrs = m[1];
    const ref = /ref="([A-Z]+\d+)"/.exec(attrs)?.[1];
    const rid = /r:id="([^"]+)"/.exec(attrs)?.[1];
    if (!ref || !rid || !relMap[rid]) continue; // lewati hyperlink internal
    const row = Number(/(\d+)$/.exec(ref)[1]);
    out.set(row, { url: relMap[rid], display: cellText.get(ref) ?? null });
  }
  return out;
}

/** Map row → DB payload via header-name lookup */
function rowToPayload(headerMap, cells) {
  const get = (names) => {
    for (const n of names) {
      const idx = headerMap[n];
      if (idx != null && cells[idx] != null) {
        const v = clean(cells[idx]);
        if (v != null) return v;
      }
    }
    return null;
  };
  const status = get(["status"]);
  const funnel = get(["funnel"]);
  const format = get(["format"]);
  const objective = get(["objective campaign", "objective"]);
  const angle = get(["angle (request)", "angle"]);
  // URL hasil ekstraksi Apps Script (hyperlink tertanam) — prioritas utama;
  // fallback ke teks Content Link langsung (berisi URL nyata).
  const linkUrl = get(["content link (url)", "link (url)"]);
  const link = linkUrl || get(["content link", "link"]);
  const captionCopy = get(["caption (copy)", "caption copy"]);
  const prefilledCopy = get(["prefilled (copy)", "prefilled copy"]);
  const caption = get(["caption"]);
  const prefilled = get(["prefilled message (if use ctwa campaign)", "prefilled message"]);
  const tanggal = get(["tanggal"]);

  // Baris placeholder / kosong: semua dropdown placeholder & tidak ada link/angle
  const hasReal =
    !isPlaceholder(status) ||
    !isPlaceholder(funnel) ||
    !isPlaceholder(format) ||
    !isPlaceholder(objective) ||
    link != null ||
    angle != null;
  if (!hasReal) return null;

  // "Copy di Note" = bukan caption nyata.
  // "Caption (Copy)" / "Prefilled (Copy)" = hasil ekstraksi Apps Script dari
  // cell notes (scripts/apps-script-extract-notes.js) — prioritas utama.
  // "Paste Disini" = placeholder instruksi di note — bukan konten nyata.
  const notPlaceholder = (v) =>
    v && /^paste\s*disini$/i.test(String(v).trim()) ? null : v;
  const realCaption =
    notPlaceholder(captionCopy) ||
    notPlaceholder(caption && /^copy\s*di\s*note$/i.test(caption) ? null : caption);
  const realPrefilled =
    notPlaceholder(prefilledCopy) ||
    notPlaceholder(prefilled && /^copy\s*di\s*note$/i.test(prefilled) ? null : prefilled);

  return {
    progress: isPlaceholder(status) ? null : status,
    pillar: isPlaceholder(funnel) ? null : funnel,
    details: isPlaceholder(objective) ? null : objective,
    format_type: isPlaceholder(format) ? null : format,
    theme: angle,
    result_link: link,
    caption: realCaption,
    content_copy: realPrefilled,
    upload_date: parseDate(tanggal),
  };
}

function changed(a, b) {
  const keys = [
    "client_id", "progress", "pillar", "details", "format_type",
    "theme", "result_link", "caption", "content_copy", "upload_date",
  ];
  return keys.some((k) => {
    // CSV publish tidak memuat isi cell notes ("Copy di Note" → null) dan
    // tidak memuat URL hyperlink tertanam. Jangan anggap berubah bila DB
    // punya caption/content_copy/result_link hasil notes-import
    // (scripts/import-ads-creative-notes-xlsx.mjs).
    if ((k === "caption" || k === "content_copy" || k === "result_link") && b[k] == null && a[k] != null) {
      return false;
    }
    return (a[k] ?? null) !== (b[k] ?? null);
  });
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no writes\n" : "🚀 Import MASTER Ads Creative publish sheet (v97)\n");

  // --- 0. Probe kolom yang dibutuhkan ---
  const { error: probeErr } = await supabase
    .from("ads_content_clusters")
    .select("progress, pillar, details, content_copy, source_sheet, sheet_row")
    .limit(1);
  if (probeErr && /column/i.test(probeErr.message || "")) {
    console.error("❌ Kolom yang dibutuhkan belum ada di ads_content_clusters.");
    console.error(`   Detail: ${probeErr.message}`);
    process.exit(1);
  }

  // --- 1. Resolve client UUID ---
  const { data: clients } = await supabase.from("clients").select("id, name");
  const clientList = clients || [];
  const findClient = (sheetName) => {
    const target = CLIENT_ALIAS[sheetName] || sheetName;
    const n = norm(target);
    const exact = clientList.find((c) => norm(c.name) === n);
    if (exact) return exact.id;
    const partial = clientList.find(
      (c) => norm(c.name).includes(n) || n.includes(norm(c.name))
    );
    return partial?.id || null;
  };

  // --- 2. Existing master rows untuk dedup ---
  const { data: existing } = await supabase
    .from("ads_content_clusters")
    .select("*")
    .like("source_sheet", "master|%");
  const existingByRowKey = new Map();
  for (const r of existing || []) existingByRowKey.set(`${r.source_sheet}#${r.sheet_row}`, r);

  // --- 3. Bersihkan row import legacy (4 file lama, source_sheet bukan master|) ---
  const { data: legacy } = await supabase
    .from("ads_content_clusters")
    .select("id, source_sheet")
    .not("source_sheet", "is", null)
    .not("source_sheet", "like", "master|%");
  if (legacy && legacy.length) {
    console.log(`🗑️  Hapus ${legacy.length} row import legacy (4 spreadsheet lama)...`);
    if (!DRY_RUN) {
      const ids = legacy.map((r) => r.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await supabase.from("ads_content_clusters").delete().in("id", ids.slice(i, i + 200));
        if (error) console.error(`   ❌ delete legacy: ${error.message}`);
      }
    }
  }

  // --- 3.5 URL hyperlink tertanam via export XLSX publish ---
  const xlsxLinks = new Map();
  try {
    const dir = await downloadMasterXlsx();
    const shared = parseSharedStrings(dir);
    for (const [name, p] of sheetFileMap(dir)) {
      xlsxLinks.set(name, sheetHyperlinks(p, shared));
    }
    const total = [...xlsxLinks.values()].reduce((a, m) => a + m.size, 0);
    console.log(`📎 XLSX hyperlink map: ${xlsxLinks.size} sheet, ${total} hyperlink eksternal`);
  } catch (e) {
    console.warn(`⚠️  Ekstraksi XLSX gagal: ${e.message} — lanjut tanpa URL hyperlink`);
  }

  let totalInsert = 0, totalUpdate = 0, totalSkip = 0, totalHref = 0;
  const seenKeys = new Set();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const sheet of SHEETS) {
    const url = `${PUBLISH_BASE}?gid=${sheet.gid}&single=true&output=csv`;
    let csv = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          csv = await res.text();
          break;
        }
        console.warn(`   ⚠️ ${sheet.sheet}: HTTP ${res.status} (attempt ${attempt}/3)`);
      } catch (e) {
        console.warn(`   ⚠️ ${sheet.sheet}: ${e.message} (attempt ${attempt}/3)`);
      }
      await sleep(1500 * attempt); // backoff — Google kadang throttle
    }
    if (csv == null) {
      console.error(`❌ ${sheet.sheet}: download failed setelah 3 attempt — SKIPPED`);
      continue;
    }
    await sleep(400); // jeda antar sheet agar tidak di-throttle Google
    const rows = parseCsv(csv);
    if (!rows.length) {
      console.log(`⚠️  ${sheet.sheet}: empty — SKIPPED`);
      continue;
    }

    const headerMap = {};
    rows[0].forEach((h, i) => {
      const key = (h || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (key && !(key in headerMap)) headerMap[key] = i;
    });

    const clientId = findClient(sheet.sheet);
    if (!clientId) console.log(`⚠️  ${sheet.sheet}: klien tidak ketemu di DB — client_hint saja`);

    const sourceSheet = `master|${sheet.sheet}`;
    let ins = 0, upd = 0, skip = 0, skippedPlaceholder = 0, hrefFixed = 0;

    // URL hyperlink tertanam — dari export XLSX (CSV tidak memuatnya).
    // Ordinal CSV r ↔ baris sheet r+1 (header XLSX = baris 1).
    const linkMap = xlsxLinks.get(sheet.sheet);

    for (let r = 1; r < rows.length; r++) {
      // Lewati baris benar-benar kosong
      if (!rows[r].some((c) => c && c.trim())) continue;

      // Baris ADA di sheet (termasuk placeholder dgn notes) — tandai seen
      // agar cleanup tidak menghapus row hasil notes-import.
      const key = `${sourceSheet}#${r}`;
      seenKeys.add(key);

      let payload = rowToPayload(headerMap, rows[r]);
      if (!payload) {
        skippedPlaceholder++;
        continue;
      }
      // Fix hyperlink tertanam: CSV hanya punya teks tampilan; URL asli
      // dari XLSX — guard teks tampilan CSV == XLSX agar tidak salah baris.
      const h = linkMap?.get(r + 1);
      if (h && /^https?:\/\//i.test(h.url)) {
        const csvCell = clean(rows[r][headerMap["content link"]] ?? "");
        const looksUrl = payload.result_link && /^https?:\/\//i.test(payload.result_link);
        const sameText = !h.display || norm(csvCell || "") === norm(h.display || "");
        if (!looksUrl && sameText) {
          payload.result_link = h.url;
          hrefFixed++;
        }
      }
      const full = { ...payload, client_id: clientId, client_hint: sheet.sheet, source_sheet: sourceSheet, sheet_row: r };

      const ex = existingByRowKey.get(key);
      if (ex) {
        if (changed(ex, full)) {
          if (DRY_RUN) {
            console.log(`   ~ UPDATE row ${r}: ${full.theme?.slice(0, 50) || full.result_link?.slice(0, 40) || "—"}`);
            upd++;
          } else {
            const patch = { ...payload, client_id: clientId, client_hint: sheet.sheet, updated_at: new Date().toISOString() };
            // Preserve caption/content_copy/result_link hasil notes-import —
            // CSV tidak memuat isi notes & URL hyperlink, jadi null dari CSV
            // tidak boleh menimpa.
            if (patch.caption == null && ex.caption != null) delete patch.caption;
            if (patch.content_copy == null && ex.content_copy != null) delete patch.content_copy;
            if (patch.result_link == null && ex.result_link != null) delete patch.result_link;
            const { error } = await supabase
              .from("ads_content_clusters")
              .update(patch)
              .eq("id", ex.id);
            if (error) console.error(`   ❌ update row ${r}: ${error.message}`);
            else upd++;
          }
        } else skip++;
      } else {
        if (DRY_RUN) {
          console.log(`   + INSERT row ${r}: ${full.theme?.slice(0, 50) || full.result_link?.slice(0, 40) || "—"}`);
          ins++;
        } else {
          const { error } = await supabase.from("ads_content_clusters").insert(full);
          if (error) console.error(`   ❌ insert row ${r}: ${error.message}`);
          else ins++;
        }
      }
    }
    console.log(
      `${sheet.sheet}: ${ins} insert, ${upd} update, ${skip} unchanged, ${skippedPlaceholder} placeholder, ${hrefFixed} href-fix${clientId ? "" : " (⚠️ client_id null)"}`
    );
    totalInsert += ins;
    totalUpdate += upd;
    totalSkip += skip;
    totalHref += hrefFixed;
  }

  // --- 4. Row dihapus dari sheet? ---
  // Hanya rows dari 20 sheet yang dikelola importer ini. Rows dari sheet
  // lain (mis. hasil notes-import: Travel Haji Umroh, Seblak Merapi, dll.)
  // tidak boleh terhapus hanya karena tidak ada di daftar SHEETS.
  const managedSheets = new Set(SHEETS.map((s) => `master|${s.sheet}`));
  const removed = [...existingByRowKey.keys()].filter(
    (k) => managedSheets.has(k.split("#")[0]) && !seenKeys.has(k)
  );
  if (removed.length) {
    console.log(`\n🗑️  ${removed.length} row ada di DB tapi tidak ada lagi di sheet master:`);
    for (const k of removed.slice(0, 10)) console.log(`   - ${k}`);
    if (!DRY_RUN) {
      for (const k of removed) {
        const row = existingByRowKey.get(k);
        if (row) await supabase.from("ads_content_clusters").delete().eq("id", row.id);
      }
    }
  }

  console.log(
    `\n${DRY_RUN ? "[DRY RUN] " : ""}✅ Selesai: ${totalInsert} insert, ${totalUpdate} update, ${totalSkip} unchanged, ${totalHref} hyperlink diekstrak dari pubhtml`
  );
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});