#!/usr/bin/env node
/**
 * audit-prefilled-notes.mjs
 *
 * Audit menyeluruh: bandingkan SEMUA cell notes (Caption / Prefilled) di XLSX master
 * vs data ads_content_clusters di Supabase.
 *
 * Deteksi:
 *  1. Notes valid yang TIDAK masuk DB (missing / row not found / update gagal)
 *  2. Notes yang ter-skip karena header kolom tidak dikenali (bug mapping)
 *  3. Placeholder notes ("paste disini") — expected skip
 *  4. Notes di sheet backup "X ..." (di-skip by design — info saja)
 *
 * Usage: node scripts/audit-prefilled-notes.mjs [--xlsx <path>]
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_XLSX = path.resolve("public/Ads Creative Content Request_ All Clients.xlsx");
const argIdx = process.argv.indexOf("--xlsx");
const XLSX = argIdx >= 0 ? process.argv[argIdx + 1] : DEFAULT_XLSX;
const TMP = "/tmp/xlsx_prefilled_audit";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!fs.existsSync(XLSX)) {
  console.error(`❌ XLSX tidak ditemukan: ${XLSX}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeXml = (s) =>
  String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, e) => XML_ENTITIES[e] ?? m);
const getAttr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
};
const isNotePlaceholder = (v) => {
  const t = String(v || "").trim();
  return !t || /^paste\s*disini\b/i.test(t);
};

async function main() {
  console.log(`🔍 AUDIT Prefilled/Caption Notes\n   XLSX: ${XLSX}\n`);

  execSync(`rm -rf "${TMP}" && mkdir -p "${TMP}" && unzip -qq "${XLSX}" -d "${TMP}"`);
  const readXml = (rel) => {
    try {
      return fs.readFileSync(path.join(TMP, rel), "utf-8");
    } catch {
      return null;
    }
  };

  // shared strings (WAJIB — cell XLSX menyimpan index, bukan teks)
  const shared = [];
  const ssXml = readXml("xl/sharedStrings.xml");
  if (ssXml) {
    for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let text = "";
      for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
      shared.push(decodeXml(text));
    }
  }
  const cellVal = (cm) => {
    const type = getAttr(cm[0], "t");
    if (type === "inlineStr") {
      const t = (cm[1] || "").match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
      return t ? decodeXml(t[1]) : null;
    }
    const v = (cm[1] || "").match(/<v>([\s\S]*?)<\/v>/);
    if (!v) return null;
    return type === "s" ? (shared[Number(v[1])] ?? null) : decodeXml(v[1]);
  };

  // sheet list (include backup utk info)
  const wbXml = readXml("xl/workbook.xml");
  const relsXml = readXml("xl/_rels/workbook.xml.rels") || "";
  const rid2target = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0];
    const id = getAttr(tag, "Id");
    const target = getAttr(tag, "Target");
    if (id && target && /worksheets\/sheet\d+\.xml$/.test(target)) rid2target.set(id, target);
  }
  const allSheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    allSheets.push({ name: getAttr(tag, "name") || "", rid: getAttr(tag, "r:id"), state: getAttr(tag, "state") });
  }

  const stats = {
    notesTotal: 0, // semua notes non-placeholder (semua sheet)
    notesLive: 0, // di sheet non-backup
    notesBackup: 0,
    placeholder: 0,
    headerUnknown: 0, // bug kandidat
    caption: 0,
    prefilled: 0,
    angle: 0,
    link: 0,
  };
  const unknownHeaders = new Map(); // header → count
  const backupNotes = new Map(); // sheet → count
  const liveNotes = []; // {sheet, rowNo, field, text, header}

  for (const s of allSheets) {
    const rel = rid2target.get(s.rid);
    if (!rel) continue;
    const sx = readXml(`xl/${rel}`);
    if (!sx) continue;
    const sheetNum = (rel.match(/sheet(\d+)\.xml/) || [])[1];
    const isBackup = s.name.startsWith("X ");

    // header row 1
    const headerByCol = new Map();
    for (const rm of sx.matchAll(/<row\b[^>]*\br="1"[^>]*>([\s\S]*?)<\/row>/g)) {
      for (const cm of rm[1].matchAll(/<c\b[^>]*?>(?:([\s\S]*?)<\/c>|\/>)/g)) {
        const full = cm[0];
        const ref = getAttr(full, "r") || "";
        const colLetter = (ref.match(/^([A-Z]+)/) || [])[1];
        if (!colLetter) continue;
        const val = cellVal(cm);
        if (val != null) headerByCol.set(colLetter, String(val).toLowerCase().replace(/\s+/g, " ").trim());
      }
    }

    // notes
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
    if (!notesXml) continue;

    let noteCount = 0;
    for (const m of notesXml.matchAll(/<comment\b[^>]*>([\s\S]*?)<\/comment>/g)) {
      const ref = getAttr(m[0], "ref") || "";
      const colLetter = (ref.match(/^([A-Z]+)/) || [])[1];
      const rowNo = Number((ref.match(/(\d+)$/) || [])[1]);
      if (!colLetter || !rowNo) continue;
      let text = "";
      for (const t of m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
      text = decodeXml(text).trim();

      if (isNotePlaceholder(text)) {
        stats.placeholder++;
        continue;
      }
      noteCount++;
      stats.notesTotal++;

      const header = headerByCol.get(colLetter) || "";
      let field = null;
      if (/^caption/.test(header)) field = "caption";
      else if (/^prefilled/.test(header)) field = "content_copy";
      else if (/^angle/.test(header)) field = "theme";
      else if (/^content link/.test(header)) field = "result_link";

      if (!field) {
        stats.headerUnknown++;
        const key = `"${header}" (kol ${colLetter})`;
        unknownHeaders.set(key, (unknownHeaders.get(key) || 0) + 1);
        continue;
      }
      stats[field === "content_copy" ? "prefilled" : field]++;

      if (isBackup) {
        stats.notesBackup++;
        backupNotes.set(s.name, (backupNotes.get(s.name) || 0) + 1);
      } else {
        stats.notesLive++;
        liveNotes.push({ sheet: s.name, rowNo, field, text, header });
      }
    }
    if (noteCount > 0 && isBackup) backupNotes.set(s.name, (backupNotes.get(s.name) || 0) + 0); // ensure key exists
  }

  console.log("═══ STATISTIK NOTES XLSX ═══");
  console.log(`Total notes valid      : ${stats.notesTotal}`);
  console.log(`  - di sheet live      : ${stats.notesLive}`);
  console.log(`  - di sheet backup "X": ${stats.notesBackup}`);
  console.log(`Placeholder (skip ok)  : ${stats.placeholder}`);
  console.log(`Caption notes          : ${stats.caption}`);
  console.log(`Prefilled notes        : ${stats.prefilled}`);
  console.log(`Angle notes            : ${stats.angle}`);
  console.log(`Link notes             : ${stats.link}`);
  console.log(`Header TAK DIKENAL ⚠️  : ${stats.headerUnknown}`);
  if (unknownHeaders.size) {
    console.log("\n-- Header tak dikenal (notes ter-skip) --");
    for (const [h, c] of unknownHeaders) console.log(`   ${h}: ${c} notes`);
  }
  if (backupNotes.size) {
    console.log("\n-- Notes di sheet backup (di-skip by design) --");
    for (const [s, c] of backupNotes) if (c) console.log(`   ${s}: ${c}`);
  }

  // ═══ Bandingkan dengan DB ═══
  const { data: dbRows, error } = await supabase
    .from("ads_content_clusters")
    .select("id, source_sheet, sheet_row, caption, content_copy, theme, result_link")
    .like("source_sheet", "master|%");
  if (error) {
    console.error("❌ DB error:", error.message);
    process.exit(1);
  }
  const byKey = new Map();
  for (const r of dbRows || []) byKey.set(`${r.source_sheet}#${r.sheet_row}`, r);

  console.log(`\n═══ PERBANDINGAN vs DB (${dbRows?.length || 0} rows master) ═══`);
  let ok = 0, rowMissing = 0, fieldEmpty = 0, diff = 0;
  const emptyPrefilled = [];
  const emptyCaption = [];
  const missingRows = [];

  for (const n of liveNotes) {
    const key = `master|${n.sheet}#${n.rowNo - 1}`;
    const row = byKey.get(key);
    if (!row) {
      rowMissing++;
      if (missingRows.length < 10) missingRows.push(`${n.sheet} r${n.rowNo} (${n.field})`);
      continue;
    }
    const dbVal = row[n.field];
    if (!dbVal || !String(dbVal).trim()) {
      fieldEmpty++;
      if (n.field === "content_copy" && emptyPrefilled.length < 15)
        emptyPrefilled.push(`${n.sheet} r${n.rowNo}: ${n.text.slice(0, 60)}...`);
      if (n.field === "caption" && emptyCaption.length < 15)
        emptyCaption.push(`${n.sheet} r${n.rowNo}: ${n.text.slice(0, 60)}...`);
    } else if (String(dbVal).trim() !== n.text.trim()) {
      diff++;
    } else {
      ok++;
    }
  }

  console.log(`✅ Notes OK di DB       : ${ok}`);
  console.log(`⚠️  Row tidak ada di DB : ${rowMissing}`);
  console.log(`❌ Field kosong di DB   : ${fieldEmpty}`);
  console.log(`🔄 Nilai beda (diff)    : ${diff}`);

  if (missingRows.length) {
    console.log("\n-- Contoh row hilang --");
    missingRows.forEach((x) => console.log(`   ${x}`));
  }
  if (emptyPrefilled.length) {
    console.log("\n-- Contoh PREFILLED kosong di DB (notes ada!) --");
    emptyPrefilled.forEach((x) => console.log(`   ${x}`));
  }
  if (emptyCaption.length) {
    console.log("\n-- Contoh CAPTION kosong di DB (notes ada!) --");
    emptyCaption.forEach((x) => console.log(`   ${x}`));
  }

  // ═══ Summary DB keseluruhan ═══
  const { count: totalRows } = await supabase
    .from("ads_content_clusters")
    .select("id", { count: "exact", head: true })
    .like("source_sheet", "master|%");
  const { count: withCaption } = await supabase
    .from("ads_content_clusters")
    .select("id", { count: "exact", head: true })
    .like("source_sheet", "master|%")
    .not("caption", "is", null)
    .neq("caption", "");
  const { count: withPrefilled } = await supabase
    .from("ads_content_clusters")
    .select("id", { count: "exact", head: true })
    .like("source_sheet", "master|%")
    .not("content_copy", "is", null)
    .neq("content_copy", "");

  console.log(`\n═══ RINGKASAN DB ═══`);
  console.log(`Total rows master      : ${totalRows ?? "?"}`);
  console.log(`Rows dgn caption       : ${withCaption ?? "?"}`);
  console.log(`Rows dgn prefilled     : ${withPrefilled ?? "?"}`);
  console.log(
    `\n${
      fieldEmpty + rowMissing > 0
        ? `❌ KESIMPULAN: ${fieldEmpty} notes field kosong + ${rowMissing} row hilang → PERLU FIX IMPORT`
        : "✅ KESIMPULAN: semua notes live sudah masuk DB"
    }`
  );
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});