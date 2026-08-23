#!/usr/bin/env node
/**
 * fix-nonurl-by-display.mjs — satu kali patch.
 *
 * Baris master dgn result_link non-URL (teks tampilan hyperlink spt
 * "Brief1_Seblak_Des.mp4") di-resolve ke URL asli via export XLSX
 * publish: match norm(display) di sheet ybs. Non-fatal bila tak match.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TMP = path.join(os.tmpdir(), "ads_master_xlsx");
const PUB =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRvBoDAzpSZytQONIf9KCAcwqWJWeMhEAgdOzM_yrxyBJTt6NO4BdiiayBT21qyy_juEks6WwqZzBlU/pub";

if (!fs.existsSync(path.join(TMP, "xl", "workbook.xml"))) {
  fs.mkdirSync(TMP, { recursive: true });
  const res = await fetch(PUB + "?output=xlsx");
  fs.writeFileSync(path.join(TMP, "m.xlsx"), Buffer.from(await res.arrayBuffer()));
  execSync(`unzip -oq "${path.join(TMP, "m.xlsx")}" -d "${TMP}"`);
}

const dx = (s) =>
  String(s)
    .split("&" + "amp;").join("&")
    .split("&" + "lt;").join("<")
    .split("&" + "gt;").join(">")
    .split("&" + "quot;").join('"')
    .split("&" + "apos;").join("'")
    .split("&#39;").join("'");

const shared = (() => {
  const f = path.join(TMP, "xl", "sharedStrings.xml");
  if (!fs.existsSync(f)) return [];
  const xml = fs.readFileSync(f, "utf-8");
  return (xml.match(/<si[ >][\s\S]*?<\/si>/g) || []).map((si) =>
    dx((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((t) => t.replace(/<[^>]*>/g, "")).join(""))
  );
})();

const wb = fs.readFileSync(path.join(TMP, "xl", "workbook.xml"), "utf-8");
const relsXml = fs.readFileSync(path.join(TMP, "xl", "_rels", "workbook.xml.rels"), "utf-8");
const relMap = {};
for (const m of relsXml.matchAll(/<Relationship\s[^>]*>/g)) {
  const id = /Id="([^"]+)"/.exec(m[0])?.[1];
  const tgt = /Target="([^"]+)"/.exec(m[0])?.[1];
  if (id && tgt) relMap[id] = tgt;
}

// sheet name → [{url, display}]
const links = new Map();
for (const m of wb.matchAll(/<sheet\s[^>]*>/g)) {
  const name = dx(/name="([^"]+)"/.exec(m[0])?.[1] || "");
  const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
  if (!name || !rid || !relMap[rid]) continue;
  const t = relMap[rid].replace(/^\//, "");
  const p = t.startsWith("xl/") ? path.join(TMP, t) : path.join(TMP, "xl", t);
  if (!fs.existsSync(p)) continue;
  const xml = fs.readFileSync(p, "utf-8");
  const cellText = new Map();
  for (const cm of xml.matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
    const ref = /r="([A-Z]+\d+)"/.exec(cm[1])?.[1];
    if (!ref) continue;
    const ty = /t="([^"]*)"/.exec(cm[1])?.[1] || "";
    const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1];
    let text = null;
    if (ty === "s" && v != null) text = shared[Number(v)] ?? null;
    else if (ty === "inlineStr") text = dx((cm[2].match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "");
    else if (v != null) text = v;
    if (text != null) cellText.set(ref, String(text));
  }
  const rp = p.replace(/([^/]+)$/, "_rels/$1.rels");
  const rm = {};
  if (fs.existsSync(rp)) {
    for (const r2 of fs.readFileSync(rp, "utf-8").matchAll(/<Relationship\s[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(r2[0])?.[1];
      const tgt = /Target="([^"]+)"/.exec(r2[0])?.[1];
      if (id && tgt && /TargetMode="External"/.test(r2[0])) rm[id] = dx(tgt);
    }
  }
  const arr = [];
  for (const hm of xml.matchAll(/<hyperlink\s([^>]*)\/?>/g)) {
    const ref = /ref="([A-Z]+\d+)"/.exec(hm[1])?.[1];
    const rid2 = /r:id="([^"]+)"/.exec(hm[1])?.[1];
    if (ref && rid2 && rm[rid2]) arr.push({ url: rm[rid2], display: cellText.get(ref) ?? null });
  }
  if (arr.length) links.set(name, arr);
}

const norm = (s) =>
  (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const { data: rows } = await sb
  .from("ads_content_clusters")
  .select("id, source_sheet, sheet_row, result_link")
  .like("source_sheet", "master|%");
const nonUrl = (rows || []).filter(
  (r) => r.result_link && !/^https?:\/\//i.test(r.result_link)
);
console.log("Non-URL rows:", nonUrl.length);

let fixed = 0;
for (const r of nonUrl) {
  const sheetName = r.source_sheet.replace(/^master\|/, "");
  const arr = links.get(sheetName) || [];
  const hit = arr.find(
    (h) =>
      h.display &&
      norm(h.display) === norm(r.result_link) &&
      /^https?:\/\//i.test(h.url)
  );
  if (hit) {
    const { error } = await sb
      .from("ads_content_clusters")
      .update({ result_link: hit.url, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) {
      console.log(`  ❌ ${sheetName} row ${r.sheet_row}: ${error.message}`);
    } else {
      fixed++;
      console.log(`  ✅ ${sheetName} row ${r.sheet_row}: "${r.result_link.slice(0, 35)}" → ${hit.url.slice(0, 60)}...`);
    }
  } else {
    console.log(`  ⏭️  ${sheetName} row ${r.sheet_row}: "${r.result_link.slice(0, 40)}" — tidak ada hyperlink match`);
  }
}
console.log(`\nFixed: ${fixed}/${nonUrl.length}`);