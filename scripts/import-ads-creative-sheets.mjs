#!/usr/bin/env node
/**
 * import-ads-creative-sheets.mjs
 *
 * Downloads 4 client "Ads Creative" Google Spreadsheets as CSV (per gid),
 * parses rows (RFC4180 — handles multi-line quoted cells), maps columns
 * BY HEADER NAME (Hadona has a different column order + extra "Aset"),
 * and imports into Supabase `ads_content_clusters` (schema v96) via
 * the service role key (PostgREST).
 *
 * Requires migration v96 (extended columns) to be applied first.
 *
 * IDEMPOTENT — dedup via (source_sheet, sheet_row, client_hint): existing
 * rows are updated in place, new rows inserted, removed rows reported.
 *
 * Usage:
 *   node scripts/import-ads-creative-sheets.mjs --dry-run
 *   node scripts/import-ads-creative-sheets.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

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
// SHEET CONFIG — 4 clients (file id + specific gid from URLs)
// ============================================================
const SHEETS = [
  { client: "TPDOC", id: "1ZdxDJO9UB0UgCjgpxlR2HcF6v5mhZhFMijkKqEP_3XI", gid: "851155289" },
  { client: "SHUMI Japan", id: "1I21UCuSa0vCA8JgqNs46YzUK8nR182YwHX5RUIMtBWk", gid: "1294953188" },
  { client: "Threenine", id: "1Mv1rvTsiwi2OZPRvlL-Da-8TVpy5ESWJ5CB0ob9afiU", gid: "396219623" },
  { client: "Hadona", id: "1jiZivO_nNEdZ2vB_ZvGJ_EO2Rfp-fFcDbcOTr-7kQaI", gid: "702190412" },
];

// ============================================================
// HELPERS
// ============================================================
const clean = (v) => {
  if (v == null) return null;
  const t = String(v).trim();
  if (t === "" || t === "-" || t === "—") return null;
  return t;
};

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function parseDate(v) {
  const t = clean(v);
  if (!t) return null;
  // ISO / yyyy-mm-dd
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
  // Excel serial
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
      // skip (handle \r\n)
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

/** Map a raw sheet row (array of cells) → DB payload using header name lookup */
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
  const tema = get(["tema"]);
  const tipe = get(["tipe"]);
  const copy = get(["copy"]);
  const details = get(["details"]);
  const aset = get(["aset", "assets"]);
  const caption = get(["caption"]);
  if (!tema && !tipe && !copy && !details && !caption) return null; // empty row
  return {
    pillar: get(["pillar"]),
    format_type: tipe,
    theme: tema,
    content_copy: copy,
    details: details || aset,
    referensi: get(["referensi"]),
    caption,
    thumbnail: get(["thumbnail"]),
    progress: get(["progress"]),
    result_link: get(["link hasil", "linkhasil", "link"]),
    assets: aset,
    upload_date: parseDate(get(["tanggal unggah"])),
  };
}

function changed(a, b) {
  const keys = [
    "client_id", "pillar", "format_type", "theme", "content_copy", "details",
    "referensi", "caption", "thumbnail", "progress", "result_link", "assets", "upload_date",
  ];
  return keys.some((k) => (a[k] ?? null) !== (b[k] ?? null));
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(DRY_RUN ? "🔍 DRY RUN — no writes\n" : "🚀 Import Ads Creative sheets (v96)\n");

  // --- 0. Verify v96 columns exist (cheap probe) ---
  const { error: probeErr } = await supabase
    .from("ads_content_clusters")
    .select("pillar, content_copy, sheet_row")
    .limit(1);
  if (probeErr && /column/i.test(probeErr.message || "")) {
    console.error("❌ Kolom v96 belum ada di tabel ads_content_clusters.");
    console.error("   → Jalankan dulu supabase/migration-v96.sql di Supabase Dashboard → SQL Editor.");
    console.error(`   Detail: ${probeErr.message}`);
    process.exit(1);
  }

  // --- 1. Resolve client UUIDs by name ---
  const { data: clients } = await supabase.from("clients").select("id, name");
  const clientList = clients || [];
  const findClient = (name) => {
    const n = norm(name);
    const exact = clientList.find((c) => norm(c.name) === n);
    if (exact) return exact.id;
    const partial = clientList.find(
      (c) => norm(c.name).includes(n) || n.includes(norm(c.name))
    );
    return partial?.id || null;
  };

  // --- 2. Load existing imported rows for dedup ---
  const { data: existing } = await supabase
    .from("ads_content_clusters")
    .select("*")
    .not("source_sheet", "is", null);
  const existingByRowKey = new Map();
  for (const r of existing || []) {
    existingByRowKey.set(`${r.source_sheet}#${r.sheet_row}`, r);
  }

  let totalInsert = 0,
    totalUpdate = 0,
    totalSkip = 0;
  const seenKeys = new Set();

  for (const sheet of SHEETS) {
    const url = `https://docs.google.com/spreadsheets/d/${sheet.id}/export?format=csv&gid=${sheet.gid}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ ${sheet.client}: download failed HTTP ${res.status} — SKIPPED`);
      continue;
    }
    const csv = await res.text();
    const rows = parseCsv(csv);
    if (!rows.length) {
      console.log(`⚠️  ${sheet.client}: empty sheet — SKIPPED`);
      continue;
    }

    // Header map: normalize header names (lowercase, collapse spaces)
    const headerMap = {};
    rows[0].forEach((h, i) => {
      const key = (h || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (key && !(key in headerMap)) headerMap[key] = i;
    });

    const clientId = findClient(sheet.client);
    if (!clientId) console.log(`⚠️  ${sheet.client}: tidak ketemu di tabel clients — pakai client_hint saja`);

    let ins = 0,
      upd = 0,
      skip = 0;

    for (let r = 1; r < rows.length; r++) {
      const payload = rowToPayload(headerMap, rows[r]);
      if (!payload) continue;
      const key = `${sheet.client}#${r}`;
      seenKeys.add(key);
      const full = { ...payload, client_id: clientId, client_hint: sheet.client, source_sheet: sheet.client, sheet_row: r };

      const ex = existingByRowKey.get(key);
      if (ex) {
        if (changed(ex, full)) {
          if (DRY_RUN) {
            console.log(`   ~ UPDATE row ${r}: ${full.theme?.slice(0, 50) || "—"}`);
            upd++;
          } else {
            const { error } = await supabase
              .from("ads_content_clusters")
              .update({ ...payload, client_id: clientId, client_hint: sheet.client, updated_at: new Date().toISOString() })
              .eq("id", ex.id);
            if (error) console.error(`   ❌ update row ${r}: ${error.message}`);
            else upd++;
          }
        } else skip++;
      } else {
        if (DRY_RUN) {
          console.log(`   + INSERT row ${r}: ${full.theme?.slice(0, 50) || "—"}`);
          ins++;
        } else {
          const { error } = await supabase.from("ads_content_clusters").insert(full);
          if (error) console.error(`   ❌ insert row ${r}: ${error.message}`);
          else ins++;
        }
      }
    }
    console.log(
      `${sheet.client}: ${ins} insert, ${upd} update, ${skip} unchanged${clientId ? "" : " (⚠️ client_id null)"}`
    );
    totalInsert += ins;
    totalUpdate += upd;
    totalSkip += skip;
  }

  // --- 3. Rows deleted from sheets? ---
  const removed = [...existingByRowKey.keys()].filter((k) => {
    const [sheetName] = k.split("#");
    return SHEETS.some((s) => s.client === sheetName) && !seenKeys.has(k);
  });
  if (removed.length) {
    console.log(`\n🗑️  ${removed.length} row ada di DB tapi tidak ada lagi di sheet:`);
    for (const k of removed.slice(0, 10)) console.log(`   - ${k}`);
    if (!DRY_RUN) {
      for (const k of removed) {
        const row = existingByRowKey.get(k);
        if (row) await supabase.from("ads_content_clusters").delete().eq("id", row.id);
      }
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}✅ Selesai: ${totalInsert} insert, ${totalUpdate} update, ${totalSkip} unchanged`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e.message);
  process.exit(1);
});