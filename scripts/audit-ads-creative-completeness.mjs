#!/usr/bin/env node
/**
 * audit-ads-creative-completeness.mjs
 *
 * Audit menyeluruh Ads Creative: spreadsheet publish vs DB.
 * Klasifikasi tiap gap ke akar masalah:
 *  - BUG_IMPORT          : sheet ADA isinya, tapi DB kosong/beda → salah importer
 *  - SUMBER_KOSONG       : kolom di sheet memang kosong → perlu diisi tim
 *  - COPY_DI_NOTE        : caption/prefilled cuma ada di cell notes → cek sudah ter-import via notes-xlsx belum
 *  - HYPERLINK_TERSEMBUNYI: teks cell pendek & bukan URL (mis. "Link","Drive") → link tertanam, hilang saat export CSV
 *
 * Output: scripts/audit-ads-creative-completeness-report.json + ringkasan per klien.
 *
 * Usage: node scripts/audit-ads-creative-completeness.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

// ---------- helpers (sama dengan importer agar appples-to-apples) ----------
const clean = (v) => {
  if (v == null) return null;
  const t = String(v).replace(/\u00a0/g, " ").trim();
  if (t === "" || t === "-" || t === "—") return null;
  return t;
};
const isPlaceholder = (v) => !v || /^pilih\s*disini$/i.test(String(v).trim());
const isPastePlaceholder = (v) => !!v && /^paste\s*disini$/i.test(String(v).trim());
const isUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || "").trim());
const isShortNonUrl = (v) => {
  if (!v) return false;
  if (isUrl(v)) return false;
  return v.length <= 25 && !/[\n]/.test(v); // teks pendek tanpa URL — indikasi hyperlink tertanam
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

// ---------- MAIN ----------
async function main() {
  console.log("🔍 AUDIT KELENGKAPAN ADS CREATIVE (sheet live vs DB)\n");

  const { data: dbRows } = await supabase
    .from("ads_content_clusters")
    .select("*")
    .like("source_sheet", "master|%");
  const dbByRowKey = new Map();
  for (const r of dbRows || []) dbByRowKey.set(`${r.source_sheet}#${r.sheet_row}`, r);
  console.log(`DB rows (master|*): ${dbByRowKey.size}`);

  const report = { generatedAt: new Date().toISOString(), perClient: {}, issues: [], totals: {} };
  const t = {
    sheetRows: 0, dbRows: dbByRowKey.size, missingInDb: 0, bugImport: 0,
    sumberKosongLink: 0, hyperlinkTersembunyi: 0,
    copyDiNoteCaptionMissing: 0, copyDiNotePrefilledMissing: 0,
    noteResolved: 0, captionMismatch: 0, linkMismatch: 0,
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const s of SHEETS) {
    const sourceSheet = `master|${s.sheet}`;
    const stats = { rows: 0, placeholder: 0, okLink: 0, noLinkSheet: 0, hyperlinkSuspect: 0, missingLink: 0, noteMissing: 0, noteOk: 0, notInDb: 0 };

    let csv = null;
    for (let a = 1; a <= 3; a++) {
      try {
        const res = await fetch(`${PUBLISH_BASE}?gid=${s.gid}&single=true&output=csv`);
        if (res.ok) { csv = await res.text(); break; }
        console.warn(`   ⚠️ ${s.sheet}: HTTP ${res.status} (${a}/3)`);
      } catch (e) { console.warn(`   ⚠️ ${s.sheet}: ${e.message} (${a}/3)`); }
      await sleep(1200 * a);
    }
    if (!csv) { console.error(`❌ ${s.sheet}: download gagal`); continue; }
    await sleep(400);

    const rows = parseCsv(csv);
    const headerMap = {};
    rows[0].forEach((h, i) => {
      const key = (h || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (key && !(key in headerMap)) headerMap[key] = i;
    });
    const colIdx = (names) => { for (const n of names) if (headerMap[n] != null) return headerMap[n]; return null; };
    const iStatus = colIdx(["status"]);
    const iFunnel = colIdx(["funnel"]);
    const iFormat = colIdx(["format"]);
    const iObjective = colIdx(["objective campaign", "objective"]);
    const iAngle = colIdx(["angle (request)", "angle"]);
    const iLink = colIdx(["content link", "link"]);
    const iCapCopy = colIdx(["caption (copy)", "caption copy"]);
    const iPreCopy = colIdx(["prefilled (copy)", "prefilled copy"]);
    const iCap = colIdx(["caption"]);
    const iPre = colIdx(["prefilled message (if use ctwa campaign)", "prefilled message"]);

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      if (!cells.some((c) => c && c.trim())) continue;
      const get = (idx) => (idx == null ? null : clean(cells[idx]));
      const status = get(iStatus), funnel = get(iFunnel), format = get(iFormat), objective = get(iObjective);
      const angle = get(iAngle), link = get(iLink);
      // kolom *Copy hasil Apps Script bisa berisi placeholder "Paste Disini" → fallback ke kolom asli
      const capCopy = get(iCapCopy);
      const preCopy = get(iPreCopy);
      const capRaw = capCopy && !isPastePlaceholder(capCopy) ? capCopy : get(iCap);
      const preRaw = preCopy && !isPastePlaceholder(preCopy) ? preCopy : get(iPre);

      const hasReal = !isPlaceholder(status) || !isPlaceholder(funnel) || !isPlaceholder(format) || !isPlaceholder(objective) || link != null || angle != null;
      stats.rows++;
      t.sheetRows++;
      if (!hasReal) { stats.placeholder++; continue; }

      const db = dbByRowKey.get(`${sourceSheet}#${r}`);
      if (!db) {
        stats.notInDb++; t.bugImport++;
        report.issues.push({ type: "BUG_IMPORT_NOT_IN_DB", client: s.sheet, row: r, angle: angle?.slice(0, 60) });
        continue;
      }

      // --- LINK ---
      if (link == null) {
        // sheet kosong
        if (db.result_link == null) { stats.noLinkSheet++; t.sumberKosongLink++; }
        else { t.linkMismatch++; report.issues.push({ type: "LINK_MISMATCH_DB_HAS", client: s.sheet, row: r }); }
      } else if (isUrl(link)) {
        stats.okLink++;
        if (db.result_link == null || db.result_link.trim() !== link) {
          t.bugImport++; t.linkMismatch++;
          report.issues.push({ type: "BUG_IMPORT_LINK", client: s.sheet, row: r, sheet: link.slice(0, 80), db: db.result_link?.slice(0, 80) ?? null });
        }
      } else if (isShortNonUrl(link)) {
        // teks pendek bukan URL → kemungkinan hyperlink tertanam
        stats.hyperlinkSuspect++; t.hyperlinkTersembunyi++;
        report.issues.push({ type: "HYPERLINK_TERSEMBUNYI", client: s.sheet, row: r, text: link.slice(0, 40), dbHasUrl: !!db.result_link && isUrl(db.result_link) });
      } else {
        // teks panjang bukan URL — dianggap anotasi; hanya catat kalau DB beda jauh
        stats.okLink++;
      }
      if (db.result_link == null && link != null) stats.missingLink++;

      // --- CAPTION / PREFILLED "Copy di Note" ---
      const checkNote = (raw, dbVal, field) => {
        if (raw && /^copy\s*di\s*note$/i.test(raw)) {
          if (dbVal == null) {
            if (field === "caption") t.copyDiNoteCaptionMissing++;
            else t.copyDiNotePrefilledMissing++;
            stats.noteMissing++;
            report.issues.push({ type: field === "caption" ? "COPY_DI_NOTE_CAPTION_MISSING" : "COPY_DI_NOTE_PREFILLED_MISSING", client: s.sheet, row: r });
          } else { stats.noteOk++; t.noteResolved++; }
        } else if (raw && dbVal != null && dbVal !== raw) {
          t.captionMismatch++;
          report.issues.push({ type: `${field.toUpperCase()}_MISMATCH`, client: s.sheet, row: r });
        }
      };
      checkNote(capRaw, db.caption, "caption");
      checkNote(preRaw, db.content_copy, "prefilled");
    }
    report.perClient[s.sheet] = stats;
    console.log(
      `${s.sheet.padEnd(30)} rows:${String(stats.rows).padStart(3)} placeholder:${String(stats.placeholder).padStart(3)} ` +
      `linkOK:${String(stats.okLink).padStart(3)} linkKosong:${String(stats.noLinkSheet).padStart(3)} ` +
      `hyperlink?:${String(stats.hyperlinkSuspect).padStart(2)} noteBelum:${String(stats.noteMissing).padStart(2)} notInDb:${stats.notInDb}`
    );
  }

  report.totals = t;
  writeFileSync("scripts/audit-ads-creative-completeness-report.json", JSON.stringify(report, null, 2));

  console.log("\n════════ RINGKASAN AKAR MASALAH ════════");
  console.log(`Baris di sheet (non-kosong) : ${t.sheetRows}`);
  console.log(`Baris di DB                 : ${t.dbRows}`);
  console.log(`🔴 BUG_IMPORT               : ${t.bugImport}  ← fix importer`);
  console.log(`🟡 SUMBER_KOSONG (link)      : ${t.sumberKosongLink}  ← tim harus isi di sheet`);
  console.log(`🟠 HYPERLINK_TERSEMBUNYI     : ${t.hyperlinkTersembunyi}  ← perlu ekstrak via Apps Script`);
  console.log(`🟠 COPY_DI_NOTE caption belum: ${t.copyDiNoteCaptionMissing}`);
  console.log(`🟠 COPY_DI_NOTE prefilled blm: ${t.copyDiNotePrefilledMissing}`);
  console.log(`🟢 COPY_DI_NOTE sudah terisi : ${t.noteResolved}`);
  console.log(`🔴 LINK mismatch             : ${t.linkMismatch}`);
  console.log(`🔴 CAPTION/PREFILLED mismatch: ${t.captionMismatch}`);
  console.log("\n📄 Detail: scripts/audit-ads-creative-completeness-report.json");
}

main().catch((e) => { console.error("❌ Fatal:", e.message); process.exit(1); });