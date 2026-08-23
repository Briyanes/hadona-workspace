#!/usr/bin/env node
/**
 * inspect-ads-rows.mjs — Lihat isi row tertentu di CSV publish master sheet.
 * Usage: node scripts/inspect-ads-rows.mjs <gid> <row1,row2,...>
 */
const PUBLISH_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvBoDAzpSZytQONIf9KCAcwqWJWeMhEAgdOzM_yrxyBJTt6NO4BdiiayBT21qyy_juEks6WwqZzBlU/pub";

const [gid, rowsArg] = process.argv.slice(2);
if (!gid || !rowsArg) {
  console.error("Usage: node scripts/inspect-ads-rows.mjs <gid> <row1,row2>");
  process.exit(1);
}
const wanted = new Set(rowsArg.split(",").map((n) => parseInt(n, 10)));

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const clean = (v) => { if (v == null) return null; const t = String(v).trim(); return t === "" ? null : t; };

const res = await fetch(`${PUBLISH_BASE}?gid=${gid}&single=true&output=csv&t=${Date.now()}`);
const csv = await res.text();
const rows = parseCsv(csv);
const header = rows[0].map((h) => (h || "").toLowerCase().trim());
const idx = (name) => header.findIndex((h) => h === name);
const cols = {
  no: idx("no."),
  angle: idx("angle (request)"),
  link: idx("content link"),
  linkUrl: idx("content link (url)"),
  caption: idx("caption"),
  captionCopy: idx("caption (copy)"),
  prefilled: idx("prefilled message (if use ctwa campaign)"),
  prefilledCopy: idx("prefilled (copy)"),
};
console.log("header kolom ditemukan:", JSON.stringify(cols));
for (let r = 1; r < rows.length; r++) {
  if (!wanted.has(r)) continue;
  const c = rows[r];
  const out = {};
  for (const [k, i] of Object.entries(cols)) {
    if (i >= 0) out[k] = clean(c[i])?.slice(0, 120) ?? null;
  }
  console.log(`row ${r}:`, JSON.stringify(out, null, 1));
}