#!/usr/bin/env node
/**
 * import-content-ads.mjs
 *
 * Downloads the published "Content Ads" Google Spreadsheet as XLSX,
 * parses ALL visible sheets (each sheet = 1 client), and imports rows
 * into Supabase `content_uploads` (schema v84) using the service role key.
 *
 * Sheet columns:
 *   No. | Status | Tanggal | Objective Campaign | Funnel | Format |
 *   Angle (request) | Content Link | Caption | Prefilled Message (CTWA)
 * Extra columns (Testing Date, CTR, ...) are stored in `extra` JSONB.
 *
 * IDEMPOTENT — dedup via sheet_name + sheet_row_no (compare & upsert).
 *
 * Usage:
 *   node scripts/import-content-ads.mjs
 *   node scripts/import-content-ads.mjs --dry-run
 *   node scripts/import-content-ads.mjs --force   (delete all imported + re-import)
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// ============================================================
// CONFIG
// ============================================================

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SPREADSHEET_PUB_ID =
  process.env.CONTENT_ADS_SHEET_ID ||
  "2PACX-1vRgXClLJSZc0NBXBXWdl3Q9ey27rtTNK0itx04ia5hx-bvteuESGkKQXlDNEa9A7u6cl-1QgUMVSuKy";
const XLSX_URL = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_PUB_ID}/pub?output=xlsx`;
const TMP_XLSX = "/tmp/content-ads.xlsx";
const TMP_DIR = "/tmp/content-ads-xlsx";

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--preview");
const FORCE = process.argv.includes("--force");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ============================================================
// HELPERS
// ============================================================

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const isPlaceholder = (v) => {
  if (!v) return true;
  return /pilih\s*disini/i.test(v) || v.trim() === "" || v.trim() === "-";
};

const clean = (v) => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

// Excel serial date -> YYYY-MM-DD (best effort)
function excelSerialToDate(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return String(serial);
  return d.toISOString().split("T")[0];
}

function colToIndex(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let idx = 0;
  for (const ch of m[1]) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return { col: idx - 1, row: parseInt(m[2], 10) };
}

const XML_ENTITIES = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

function decodeXml(s) {
  if (!s) return s;
  // one-pass: numeric (&#39;) + named entities; amp handled as token so
  // "&lt;" correctly becomes literal "<" (no double-decode)
  return s.replace(/&#(\d+);|&(lt|gt|quot|apos|amp);/g, (m, num, name) => {
    if (num) return String.fromCharCode(parseInt(num, 10));
    return XML_ENTITIES[name] ?? m;
  });
}

// ============================================================
// 1. DOWNLOAD + EXTRACT XLSX
// ============================================================

async function downloadAndExtract() {
  console.log("⬇️  Downloading XLSX export...");
  const res = await fetch(XLSX_URL);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(TMP_XLSX, buf);
  console.log(`   Saved ${Math.round(buf.length / 1024)} KB → ${TMP_XLSX}`);

  execSync(`rm -rf ${TMP_DIR} && mkdir -p ${TMP_DIR} && unzip -o -q ${TMP_XLSX} -d ${TMP_DIR}`);
  console.log(`   Extracted → ${TMP_DIR}`);
}

// ============================================================
// 2. PARSE WORKBOOK
// ============================================================

function parseWorkbook() {
  const workbookXml = fs.readFileSync(path.join(TMP_DIR, "xl/workbook.xml"), "utf-8");
  const tagRegex = /<sheet\b[^>]*>/g;
  const sheets = [];
  let m;
  while ((m = tagRegex.exec(workbookXml)) !== null) {
    const tag = m[0];
    const nameMatch = /name="([^"]+)"/.exec(tag);
    const stateMatch = /state="([^"]+)"/.exec(tag);
    if (nameMatch) {
      sheets.push({ name: decodeXml(nameMatch[1]), state: stateMatch ? stateMatch[1] : "visible" });
    }
  }
  // Shared strings
  const sharedStrings = [];
  const ssPath = path.join(TMP_DIR, "xl/sharedStrings.xml");
  if (fs.existsSync(ssPath)) {
    const ssXml = fs.readFileSync(ssPath, "utf-8");
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    while ((m = siRegex.exec(ssXml)) !== null) {
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
      let tm;
      let text = "";
      while ((tm = tRegex.exec(m[1])) !== null) text += tm[1];
      sharedStrings.push(decodeXml(text));
    }
  }
  return { sheets, sharedStrings };
}

// Parse a worksheet XML into rows: [{ row: <excel row no>, cells: { colIndex: value } }]
function parseSheet(fileName) {
  const sheetPath = path.join(TMP_DIR, "xl/worksheets", fileName);
  if (!fs.existsSync(sheetPath)) return [];
  const xml = fs.readFileSync(sheetPath, "utf-8");
  const rows = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const rowNum = parseInt(rm[1], 10);
    const cells = {};
    const cRegex = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g;
    let cm;
    while ((cm = cRegex.exec(rm[2])) !== null) {
      const attrs = cm[1] || cm[3] || "";
      const inner = cm[2] || "";
      const rMatch = /r="([A-Z]+\d+)"/.exec(attrs);
      if (!rMatch) continue;
      const { col } = colToIndex(rMatch[1]);
      const tMatch = /t="([^"]+)"/.exec(attrs);
      const type = tMatch ? tMatch[1] : null;

      let value = null;
      if (type === "s") {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vMatch) value = sharedStringsGlobal[parseInt(vMatch[1], 10)] ?? null;
      } else if (type === "inlineStr" || type === "str") {
        const tRegex2 = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
        if (tRegex2) value = decodeXml(tRegex2[1]);
      } else {
        const vMatch = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vMatch) value = vMatch[1];
      }
      if (value !== null && value !== "") cells[col] = value;
    }
    rows.push({ row: rowNum, cells });
  }
  return rows;
}

// ============================================================
// 3. HEADER MAPPING
// ============================================================

// normalized header -> field
function mapHeader(h) {
  const n = norm(h);
  if (n === "no" || n === "nomor" || n === "produk") return "ad_no";
  if (n === "tanggal" || n === "date" || n === "tododate") return "tanggal";
  if (n.includes("objective")) return "objective";
  if (n === "funnel") return "funnel";
  if (n === "format") return "format_type";
  if (n.includes("tema") || n.includes("angle")) return "angle";
  if (n.includes("contentlink") || n.includes("linkcontent") || n === "link") return "content_link";
  if (n.includes("caption")) return "caption";
  if (n.includes("prefilled") || n.includes("predefined")) return "prefilled_message";
  return null; // unknown (Status, Performance, Divisi, Brief, ...) → extra
}

// ============================================================
// MAIN
// ============================================================

let sharedStringsGlobal = [];

async function main() {
  console.log(`\n🎬 CONTENT ADS IMPORTER ${DRY_RUN ? "(DRY RUN)" : ""}\n`);

  await downloadAndExtract();
  const { sheets } = parseWorkbook();
  sharedStringsGlobal = parseWorkbookSharedStrings();

  const visible = sheets.filter((s) => s.state !== "hidden" && s.state !== "veryHidden");
  console.log(`📋 Workbook: ${sheets.length} sheets (${visible.length} visible)\n`);

  // ---- Parse all records ----
  const records = [];
  visible.forEach((s, i) => {
    const rows = parseSheet(`sheet${i + 1}.xml`);
    if (!rows.length) return;

    // find header row: contains "objective" or "status" + "caption"
    let headerRow = null;
    let headerMap = null;
    for (const r of rows.slice(0, 10)) {
      const hm = {};
      let score = 0;
      Object.entries(r.cells).forEach(([col, val]) => {
        const field = mapHeader(val);
        if (field) {
          hm[col] = field;
          score++;
          // "PRODUK" is a merged header — next column holds the product name
          if (norm(val) === "produk") {
            const next = String(parseInt(col, 10) + 1);
            if (!hm[next]) hm[next] = "extra:Produk Name";
          }
        } else if (clean(val)) {
          hm[col] = `extra:${val}`;
        }
      });
      const hasCaption = Object.values(hm).includes("caption");
      if (hm && (hasCaption || Object.values(hm).includes("objective"))) {
        headerRow = r.row;
        headerMap = hm;
        break;
      }
    }
    if (!headerMap) {
      console.log(`   ⚠️  [${s.name}] no header row found — skipped`);
      return;
    }

    let imported = 0;
    for (const r of rows) {
      if (r.row <= headerRow) continue;
      const rec = {
        sheet_name: s.name,
        sheet_row_no: r.row,
        extra: {},
      };
      let hasData = false;

      Object.entries(r.cells).forEach(([col, rawVal]) => {
        const field = headerMap[col];
        if (!field) return;
        if (field.startsWith("extra:")) {
          const headerName = field.slice(6);
          const v = clean(rawVal);
          if (v && !isPlaceholder(v)) {
            rec.extra[headerName] = v;
            hasData = true;
          }
          return;
        }
        if (field === "ad_no") {
          rec.ad_no = clean(rawVal);
          return;
        }
        const v = clean(rawVal);
        if (v && !isPlaceholder(v)) {
          if (field === "tanggal" && /^\d+(\.\d+)?$/.test(v)) {
            rec.tanggal = excelSerialToDate(parseFloat(v));
          } else {
            rec[field] = v;
          }
          hasData = true;
        }
      });

      if (!hasData) continue; // empty / placeholder-only row
      const mainFields = ["ad_no","tanggal","objective","funnel","format_type","angle","content_link","caption","prefilled_message"];
      if (!mainFields.some((f) => rec[f])) continue; // sub-header / extra-only row
      const clientHint = rec.extra && (rec.extra["Client"] || rec.extra["client"]);
      if (clientHint) rec.client_hint = clientHint;
      imported++;
      records.push(rec);
    }
    console.log(`   ✓ [${s.name}] ${imported} data rows`);
  });

  console.log(`\n📊 Total records to import: ${records.length}`);

  // ---- Fetch clients for matching ----
  const { data: clients } = await supabase.from("clients").select("id, name");
  const clientList = clients || [];
  const clientByNorm = new Map(clientList.map((c) => [norm(c.name), c.id]));

  function matchClient(sheetName) {
    const n = norm(sheetName);
    if (clientByNorm.has(n)) return clientByNorm.get(n);
    // partial match (sheet name contains client name or vice versa)
    for (const [cn, id] of clientByNorm) {
      if (cn.length >= 4 && (n.includes(cn) || cn.includes(n))) return id;
    }
    return null;
  }

  // ---- Fetch a profile id for created_by (needed if NOT NULL) ----
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  const systemUserId = profiles?.[0]?.id || null;

  const unmatched = new Set();
  records.forEach((r) => {
    r.client_label = r.sheet_name;
    r.client_id = matchClient(r.sheet_name) || (r.client_hint ? matchClient(r.client_hint) : null);
    if (!r.client_id) unmatched.add(r.sheet_name);
  });

  if (unmatched.size) {
    console.log(`\n⚠️  No client match for sheets: ${[...unmatched].join(", ")}`);
    console.log("   (rows still imported with client_label only)");
  }

  const matchedCount = records.filter((r) => r.client_id).length;
  console.log(`🔗 Client matched: ${matchedCount}/${records.length}`);

  // ---- Fetch existing imported rows ----
  const sheetNames = [...new Set(records.map((r) => r.sheet_name))];
  const { data: existing } = await supabase
    .from("content_uploads")
    .select("id, sheet_name, sheet_row_no")
    .in("sheet_name", sheetNames.length ? sheetNames : ["__none__"]);
  const existingMap = new Map(
    (existing || []).map((e) => [`${e.sheet_name}#${e.sheet_row_no}`, e.id])
  );

  const toInsert = records.filter((r) => !existingMap.has(`${r.sheet_name}#${r.sheet_row_no}`));
  const toUpdate = records.filter((r) => existingMap.has(`${r.sheet_name}#${r.sheet_row_no}`));

  console.log(`\n🆕 New: ${toInsert.length}  |  🔄 Update: ${toUpdate.length}`);

  if (DRY_RUN) {
    console.log("\n🔍 DRY RUN — sample records:");
    toInsert.slice(0, 5).forEach((r) => {
      console.log(
        `   [${r.sheet_name} #${r.sheet_row_no}] No.${r.ad_no || "-"} ${r.ad_status || "-"} | ${r.objective || "-"} | ${r.funnel || "-"} | ${r.format_type || "-"} | ${(r.caption || "").substring(0, 40)}`
      );
    });
    console.log("\n✅ Dry run complete. Run without --dry-run to import.");
    return;
  }

  // ---- FORCE: wipe previous import ----
  if (FORCE && existing?.length) {
    const ids = existing.map((e) => e.id);
    console.log(`\n🗑️  FORCE: deleting ${ids.length} previously imported rows...`);
    for (let i = 0; i < ids.length; i += 200) {
      await supabase.from("content_uploads").delete().in("id", ids.slice(i, i + 200));
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const basePayload = (r) => ({
    client_id: r.client_id,
    client_label: r.client_label,
    upload_date: today,
    division: "SMM",
    status: "todo",
    ad_no: r.ad_no || null,
    ad_status: r.ad_status || "off",
    tanggal: r.tanggal || null,
    objective: r.objective || null,
    funnel: r.funnel || null,
    format_type: r.format_type || null,
    angle: r.angle || null,
    content_link: r.content_link || null,
    caption: r.caption || null,
    prefilled_message: r.prefilled_message || null,
    sheet_name: r.sheet_name,
    sheet_row_no: r.sheet_row_no,
    extra: Object.keys(r.extra).length ? r.extra : {},
  });

  // ---- Insert (batches of 100) ----
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100).map((r) => ({
      ...basePayload(r),
      created_by: systemUserId,
    }));
    const { error } = await supabase.from("content_uploads").insert(batch);
    if (error) {
      console.error(`❌ Insert batch ${i / 100 + 1} failed: ${error.message}`);
      console.error(`   First record: ${JSON.stringify(batch[0]).substring(0, 300)}`);
    } else {
      inserted += batch.length;
    }
  }

  // ---- Update changed rows (batches of 50, individual upsert) ----
  let updated = 0;
  for (const r of toUpdate) {
    const id = existingMap.get(`${r.sheet_name}#${r.sheet_row_no}`);
    const { error } = await supabase
      .from("content_uploads")
      .update(basePayload(r))
      .eq("id", id);
    if (error) console.error(`❌ Update ${r.sheet_name}#${r.sheet_row_no}: ${error.message}`);
    else updated++;
  }

  console.log(`\n✅ DONE: ${inserted} inserted, ${updated} updated, ${records.length} total processed`);
}

function parseWorkbookSharedStrings() {
  const ssPath = path.join(TMP_DIR, "xl/sharedStrings.xml");
  const arr = [];
  if (!fs.existsSync(ssPath)) return arr;
  const xml = fs.readFileSync(ssPath, "utf-8");
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    let text = "";
    while ((tm = tRegex.exec(m[1])) !== null) text += tm[1];
    arr.push(decodeXml(text));
  }
  return arr;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Fatal:", err);
    process.exit(1);
  });