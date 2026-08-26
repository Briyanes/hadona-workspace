#!/usr/bin/env node
/** Verifikasi: apakah diff dry-run persisten disebabkan snapshot XLSX publish tidak stabil? */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { config } from "dotenv";
config({ path: ".env.local" });

const PUBLISH_BASE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvBoDAzpSZytQONIf9KCAcwqWJWeMhEAgdOzM_yrxyBJTt6NO4BdiiayBT21qyy_juEks6WwqZzBlU/pub";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const AMP = String.fromCharCode(38);
const dec = (s) =>
  String(s).split(AMP + "amp;").join(AMP).split(AMP + "lt;").join("<").split(AMP + "gt;").join(">").split(AMP + "quot;").join('"').split(AMP + "#39;").join("'");

async function getSheets() {
  const TMP = path.join(os.tmpdir(), `snap_${Date.now()}`);
  fs.mkdirSync(TMP, { recursive: true });
  const res = await fetch(`${PUBLISH_BASE}?output=xlsx`, { cache: "no-store" });
  fs.writeFileSync(path.join(TMP, "m.xlsx"), Buffer.from(await res.arrayBuffer()));
  execSync(`unzip -oq "${TMP}/m.xlsx" -d "${TMP}"`);
  const shared = (fs.readFileSync(`${TMP}/xl/sharedStrings.xml`, "utf-8").match(/<si[ >][\s\S]*?<\/si>/g) || []).map((si) =>
    dec((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]*>/g, "")).join(""))
  );
  const wb = fs.readFileSync(`${TMP}/xl/workbook.xml`, "utf-8");
  const rels = fs.readFileSync(`${TMP}/xl/_rels/workbook.xml.rels`, "utf-8");
  const rm = {};
  for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t) rm[id] = t;
  }
  const out = {};
  for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
    const name = dec(/name="([^"]+)"/.exec(m[0])?.[1] || "");
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid || !rm[rid]) continue;
    const t = rm[rid].replace(/^\//, "");
    const p = t.startsWith("xl/") ? `${TMP}/${t}` : `${TMP}/xl/${t}`;
    if (fs.existsSync(p)) out[name.trim()] = p;
  }
  return { shared, sheets: out, TMP };
}

function parseCells(file, shared) {
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
      else if (v != null) text = v;
      if (text != null) cells.set(ref, String(text).trim());
    }
    if (cells.size) rows.set(Number(rm[1]), cells);
  }
  return rows;
}

// header detection sederhana ( Caption / Caption (Copy) / Prefilled )
function headerOf(rows) {
  for (const [rn, cells] of [...rows].sort((a, b) => a[0] - b[0]).slice(0, 12)) {
    const c = {};
    for (const [col, raw] of cells) {
      const h = String(raw).toLowerCase().replace(/\s+/g, " ").trim();
      if (/^caption$/.test(h)) c.cap = col;
      else if (/^caption\s*\(copy\)$/.test(h)) c.capCopy = col;
      else if (/^prefilled/.test(h) && /\(copy\)/.test(h)) c.preCopy = col;
      else if (/^prefilled/.test(h)) c.pre = col;
    }
    if (c.cap || c.capCopy) return { rn, c };
  }
  return null;
}

const TARGETS = ["Olive Cookies", "Seminar Kulit", "Bolu Pisang bu Winda", "Anurakti"];
const SNAPSHOTS = [];
for (let i = 1; i <= 2; i++) {
  const { shared, sheets } = await getSheets();
  const snap = {};
  for (const t of TARGETS) {
    const f = Object.entries(sheets).find(([n]) => n === t)?.[1];
    if (!f) { snap[t] = null; continue; }
    const rows = parseCells(f, shared);
    const h = headerOf(rows);
    if (!h) { snap[t] = null; continue; }
    snap[t] = {};
    for (const [rn, cells] of rows) {
      if (rn <= h.rn || rn > 8) continue;
      const g = (col) => (col ? cells.get(col) : undefined);
      const cap = g(h.c.cap), capCopy = g(h.c.capCopy), pre = g(h.c.pre), preCopy = g(h.c.preCopy);
      snap[t][rn] = {
        cap: cap?.slice(0, 40),
        capCopy: capCopy?.slice(0, 40),
        pre: pre?.slice(0, 30),
        preCopy: preCopy?.slice(0, 30),
      };
    }
  }
  SNAPSHOTS.push(snap);
  if (i === 1) await new Promise((r) => setTimeout(r, 4000));
}

console.log("=== STABILITAS SNAPSHOT (download 1 vs 2) ===");
console.log(JSON.stringify(SNAPSHOTS[0]) === JSON.stringify(SNAPSHOTS[1]) ? "✅ IDENTIK" : "❌ BEDA → cache publish Google flaky");

console.log("\n=== SNAPSHOT TERBARU (download #2) ===");
console.log(JSON.stringify(SNAPSHOTS[1], null, 1).slice(0, 3000));

console.log("\n=== DB (master|...) rows terkait ===");
for (const t of TARGETS) {
  const { data } = await sb
    .from("ads_content_clusters")
    .select("sheet_row, caption, content_copy")
    .eq("source_sheet", `master|${t}`)
    .order("sheet_row");
  for (const r of data || []) {
    if (r.sheet_row > 8) continue;
    console.log(
      `${t} #${r.sheet_row}: caption=${JSON.stringify(r.caption)?.slice(0, 45)} content_copy=${JSON.stringify(r.content_copy)?.slice(0, 35)}`
    );
  }
}