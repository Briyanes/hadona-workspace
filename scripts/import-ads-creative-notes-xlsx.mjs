#!/usr/bin/env node
/**
 * import-ads-creative-notes-xlsx.mjs
 *
 * Import "Ads Creative" dari export XLSX MASTER spreadsheet — termasuk CELL NOTES
 * yang berisi Caption & Prefilled Message asli (tidak ikut ter-publish di CSV).
 *
 * Sumber: "Ads Creative Content Request_ All Clients.xlsx" (export Google Sheets).
 * - 34 sheet: 20 live + 6 klien baru + 8 backup "X ..." (backup di-skip).
 * - Copy asli ada di notes kolom Caption (I) & Prefilled (J); cell hanya "Copy di Note".
 * - Row XLSX N = sheet_row DB N-1 (header row 1 → CSV row 0).
 * - Dedup: (source_sheet='master|<nama>', sheet_row); fallback match by result_link.
 * - Notes placeholder ("paste disini") diabaikan.
 *
 * Usage:
 *   node scripts/import-ads-creative-notes-xlsx.mjs --dry-run
 *   node scripts/import-ads-creative-notes-xlsx.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("--preview");
const XLSX_DEFAULT = "/Users/mac/Downloads/Ads Creative Content Request_ All Clients.xlsx";
const xlsxArgIdx = process.argv.indexOf("--xlsx");
const XLSX = xlsxArgIdx >= 0 ? process.argv[xlsxArgIdx + 1] : XLSX_DEFAULT;
const TMP = "/tmp/xlsx_ads_notes_import";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!fs.existsSync(XLSX)) {
  console.error(`❌ File XLSX tidak ditemukan: ${XLSX}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Alias nama sheet → nama klien di tabel clients (sinkron dgn import-ads-creative-master.mjs)
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
// XML HELPERS
// ============================================================
const XML_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decodeXml = (s) =>
  String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, e) => XML_ENTITIES[e] ?? m);

const getAttr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
};

const clean = (v) => {
  if (v == null) return null;
  const t = String(v).replace(/\u00a0/g, " ").trim();
  if (t === "" || t === "-" || t === "—") return null;
  return t;
};

const isPlaceholder = (v) => !v || /^pilih\s*disini$/i.test(String(v).trim());

const isNotePlaceholder = (v) => {
  const t = String(v || "").trim();
  return !t || /^paste\s*disini\b/i.test(t);
};

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
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    // Excel serial date
    const d = new Date(Math.round((parseFloat(t) - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

/** Header name → field mapping (sama dgn import-ads-creative-master.mjs) */
const HEADER_FIELD = [
  { match: [/^status$/], key: "status" },
  { match: [/^tanggal$/], key: "tanggal" },
  { match: [/^objective campaign$/, /^objective$/], key: "objective" },
  { match: [/^funnel$/], key: "funnel" },
  { match: [/^format$/], key: "format" },
  { match: [/^angle \(request\)$/, /^angle$/], key: "angle" },
  { match: [/^content link$/, /^link$/], key: "link" },
  { match: [/^caption \(copy\)$/, /^caption copy$/], key: "captionCopy" },
  { match: [/^prefilled \(copy\)$/, /^prefilled copy$/], key: "prefilledCopy" },
  { match: [/^caption$/], key: "caption" },
  {
    match: [/^prefilled message \(if use ctwa campaign\)$/, /^prefilled message$/, /^prefilled \(copy\)$/],
    key: "prefilled",
  },
];

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(
    (DRY_RUN ? "🔍 DRY RUN — no writes\n" : "🚀 ") +
      `Import Ads Creative NOTES dari XLSX:\n   ${XLSX}\n`
  );

  // --- 0. Extract XLSX ---
  execSync(`rm -rf "${TMP}" && mkdir -p "${TMP}" && unzip -qq "${XLSX}" -d "${TMP}"`);
  const readXml = (rel) => {
    try {
      return fs.readFileSync(path.join(TMP, rel), "utf-8");
    } catch {
      return null;
    }
  };

  // --- 1. Sheet list (skip backup "X " & hidden) ---
  const wbXml = readXml("xl/workbook.xml");
  const relsXml = readXml("xl/_rels/workbook.xml.rels") || "";
  const rid2target = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = getAttr(tag, "Id");
    const target = getAttr(tag, "Target");
    if (id && target && /worksheets\/sheet\d+\.xml$/.test(target)) {
      rid2target.set(id, target); // "worksheets/sheetN.xml" — relative ke xl/
    }
  }
  const allSheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    allSheets.push({
      name: getAttr(tag, "name") || "",
      rid: getAttr(tag, "r:id"),
      state: getAttr(tag, "state"),
    });
  }
  // NOTE: hanya backup "X ..." yang di-skip. Sheet state="hidden" TETAP diproses
  // karena sheet tsb live di Google Sheets ( disembunyikan di UI) dan datanya
  // sudah ter-import ke DB via publish CSV.
  const sheets = allSheets.filter((s) => !s.name.startsWith("X ") && rid2target.has(s.rid));
  console.log(
    `📋 ${allSheets.length} sheet total → ${sheets.length} diproses ` +
      `(${allSheets.length - sheets.length} backup "X " di-skip)\n`
  );

  // --- 2. Shared strings ---
  const shared = [];
  const ssXml = readXml("xl/sharedStrings.xml");
  if (ssXml) {
    for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let text = "";
      for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
      shared.push(decodeXml(text));
    }
  }

  // --- 3. Parse tiap sheet: header, cell values, notes ---
  let totalRealNotes = 0;
  const sheetData = []; // { name, rows: Map<rowNo, {cols: Map<col, val>}>, notes: Map<rowNo, {caption, content_copy, ...}> }

  for (const s of sheets) {
    const rel = rid2target.get(s.rid);
    const sx = readXml(`xl/${rel}`);
    if (!sx) continue;
    const sheetNum = (rel.match(/sheet(\d+)\.xml/) || [])[1];

    // header row 1: col → normalized header name
    const headerByCol = new Map();
    // cell values: row → col → value
    const rowVals = new Map();
    for (const rm of sx.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowNo = Number(rm[1]);
      const cols = new Map();
      for (const cm of rm[2].matchAll(/<c\b[^>]*?>(?:([\s\S]*?)<\/c>|\/>)/g)) {
        const full = cm[0];
        const ref = getAttr(full, "r") || "";
        const colLetter = (ref.match(/^([A-Z]+)/) || [])[1];
        if (!colLetter) continue;
        const type = getAttr(full, "t");
        let val = null;
        if (type === "inlineStr") {
          const t = (cm[1] || "").match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
          val = t ? decodeXml(t[1]) : null;
        } else {
          const v = (cm[1] || "").match(/<v>([\s\S]*?)<\/v>/);
          if (v) val = type === "s" ? (shared[Number(v[1])] ?? null) : decodeXml(v[1]);
        }
        if (val != null) cols.set(colLetter, val);
      }
      if (cols.size) rowVals.set(rowNo, cols);
      if (rowNo === 1) {
        for (const [col, val] of cols) headerByCol.set(col, String(val).toLowerCase().replace(/\s+/g, " ").trim());
      }
    }

    // notes: comments{N}.xml (fallback via sheet rels)
    let notesXml = readXml(`xl/comments${sheetNum}.xml`);
    if (!notesXml) {
      const srels = readXml(`xl/worksheets/_rels/sheet${sheetNum}.xml.rels`) || "";
      for (const m of srels.matchAll(/<Relationship\b[^>]*>/g)) {
        if (/\/comments$/.test(getAttr(m[0], "Type") || "")) {
          const t = (getAttr(m[0], "Target") || "").replace(/^\.\.\//, "");
          notesXml = readXml(t.startsWith("xl/") ? t : `xl/${t}`);
        }
      }
    }
    const notes = new Map(); // rowNo → {caption, content_copy, theme, result_link}
    if (notesXml) {
      for (const m of notesXml.matchAll(/<comment\b[^>]*>([\s\S]*?)<\/comment>/g)) {
        const ref = getAttr(m[0], "ref") || "";
        const colLetter = (ref.match(/^([A-Z]+)/) || [])[1];
        const rowNo = Number((ref.match(/(\d+)$/) || [])[1]);
        if (!colLetter || !rowNo) continue;
        let text = "";
        for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
        text = decodeXml(text).trim();
        if (isNotePlaceholder(text)) continue;

        const header = headerByCol.get(colLetter) || "";
        let field = null;
        if (/^caption/.test(header)) field = "caption";
        else if (/^prefilled/.test(header)) field = "content_copy";
        else if (/^angle/.test(header)) field = "theme";
        else if (/^content link/.test(header)) field = "result_link";
        if (!field) continue;

        if (!notes.has(rowNo)) notes.set(rowNo, {});
        notes.get(rowNo)[field] = text;
        totalRealNotes++;
      }
    }

    sheetData.push({ name: s.name, headerByCol, rowVals, notes });
  }

  const withNotes = sheetData.filter((sd) => sd.notes.size > 0);
  console.log(`📝 Notes asli (non-placeholder): ${totalRealNotes} di ${withNotes.length} sheet\n`);

  // --- 4. Resolve clients ---
  const { data: clients } = await supabase.from("clients").select("id, name");
  const clientList = clients || [];
  const findClient = (sheetName) => {
    const target = CLIENT_ALIAS[sheetName] || sheetName;
    const n = norm(target);
    const exact = clientList.find((c) => norm(c.name) === n);
    if (exact) return exact.id;
    const partial = clientList.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name)));
    return partial?.id || null;
  };

  // --- 5. Existing master rows utk dedup ---
  const { data: existing } = await supabase
    .from("ads_content_clusters")
    .select("*")
    .like("source_sheet", "master|%");
  const byRowKey = new Map();
  const byLink = new Map(); // `${source_sheet}|${link}` → row
  for (const r of existing || []) {
    byRowKey.set(`${r.source_sheet}#${r.sheet_row}`, r);
    if (r.result_link) byLink.set(`${r.source_sheet}|${r.result_link.trim()}`, r);
  }

  // --- 6. Proses ---
  let upd = 0, ins = 0, skip = 0, miss = 0;

  for (const sd of withNotes) {
    const sourceSheet = `master|${sd.name}`;
    const clientId = findClient(sd.name);
    if (!clientId) console.log(`⚠️  ${sd.name}: klien tidak ketemu di DB — client_hint saja`);

    // header → field key (dari row 1)
    const colToField = new Map();
    for (const [col, header] of sd.headerByCol) {
      for (const hf of HEADER_FIELD) {
        if (hf.match.some((re) => re.test(header))) {
          if (!colToField.has(col)) colToField.set(col, hf.key);
          break;
        }
      }
    }

    let u = 0, i2 = 0, sk = 0;
    for (const [rowNo, noteFields] of sd.notes) {
      const sheetRow = rowNo - 1; // XLSX row N = sheet_row N-1
      const cols = sd.rowVals.get(rowNo) || new Map();

      // cell values via header mapping
      const vals = {};
      for (const [col, v] of cols) {
        const key = colToField.get(col);
        if (key) vals[key] = clean(v);
      }
      const hasRealCell =
        !isPlaceholder(vals.status) ||
        !isPlaceholder(vals.funnel) ||
        !isPlaceholder(vals.format) ||
        !isPlaceholder(vals.objective) ||
        vals.link != null ||
        vals.angle != null;

      // payload notes (prioritas) — hanya field yang benar2 dari notes
      const notePatch = {};
      for (const [f, v] of Object.entries(noteFields)) notePatch[f] = v;

      // cari existing
      let ex = byRowKey.get(`${sourceSheet}#${sheetRow}`);
      if (!ex && vals.link) {
        ex = byLink.get(`${sourceSheet}|${vals.link.trim()}`);
        if (ex) console.log(`   ↪ ${sd.name} row ${rowNo}: align by link → sheet_row ${ex.sheet_row}`);
      }

      if (ex) {
        const patch = {};
        for (const [f, v] of Object.entries(notePatch)) {
          if ((ex[f] ?? null) !== v) patch[f] = v;
        }
        if (Object.keys(patch).length === 0) {
          sk++;
        } else if (DRY_RUN) {
          console.log(`   ~ UPDATE ${sd.name} r${rowNo}: ${Object.keys(patch).join(", ")}`);
          u++;
        } else {
          const { error } = await supabase
            .from("ads_content_clusters")
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", ex.id);
          if (error) console.error(`   ❌ update ${sd.name} r${rowNo}: ${error.message}`);
          else u++;
        }
      } else {
        // insert row baru (row belum ada di DB — mis. sheet baru / row baru)
        if (!hasRealCell && Object.keys(notePatch).length === 0) {
          miss++;
          continue;
        }
        const captionCell =
          vals.captionCopy ||
          (vals.caption && !/^copy\s*di\s*note$/i.test(vals.caption) ? vals.caption : null);
        const prefilledCell =
          vals.prefilledCopy ||
          (vals.prefilled && !/^copy\s*di\s*note$/i.test(vals.prefilled) ? vals.prefilled : null);
        const full = {
          client_id: clientId,
          progress: isPlaceholder(vals.status) ? null : vals.status,
          pillar: isPlaceholder(vals.funnel) ? null : vals.funnel,
          details: isPlaceholder(vals.objective) ? null : vals.objective,
          format_type: isPlaceholder(vals.format) ? null : vals.format,
          theme: notePatch.theme ?? vals.angle ?? null,
          result_link: notePatch.result_link ?? vals.link ?? null,
          caption: notePatch.caption ?? captionCell ?? null,
          content_copy: notePatch.content_copy ?? prefilledCell ?? null,
          upload_date: parseDate(vals.tanggal),
          source_sheet: sourceSheet,
          sheet_row: sheetRow,
          client_hint: sd.name,
        };
        if (DRY_RUN) {
          console.log(`   + INSERT ${sd.name} r${rowNo} (sheet_row ${sheetRow})`);
          i2++;
        } else {
          const { error } = await supabase.from("ads_content_clusters").insert(full);
          if (error) console.error(`   ❌ insert ${sd.name} r${rowNo}: ${error.message}`);
          else {
            byRowKey.set(`${sourceSheet}#${sheetRow}`, { ...full, id: "new" });
            i2++;
          }
        }
      }
    }
    console.log(
      `${sd.name}: ${u} update caption, ${i2} insert, ${sk} sudah-sama${clientId ? "" : " (⚠️ client null)"}`
    );
    upd += u;
    ins += i2;
    skip += sk;
  }

  console.log(
    `\n${DRY_RUN ? "[DRY RUN] " : ""}✅ Selesai: ${upd} update notes, ${ins} insert, ${skip} unchanged, ${miss} skipped`
  );
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});