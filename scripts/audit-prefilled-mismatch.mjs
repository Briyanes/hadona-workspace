#!/usr/bin/env node
/**
 * audit-prefilled-mismatch.mjs
 *
 * Audit SEMANTIK menyeluruh: deteksi prefilled/caption yang TIDAK SESUAI
 * dengan client pemilik row (notes salah tempat akibat copy-paste antar sheet).
 *
 * Metode:
 *  1. Ambil semua rows master dari ads_content_clusters (323 rows)
 *  2. Bangun brand-keyword map dari nama sheet/client + alias akronim
 *  3. Scan content_copy (prefilled) & caption → deteksi brand di teks
 *  4. Flag mismatch: brand terdeteksi ≠ client pemilik row
 *  5. Flag anomali: prefilled duplikat lintas client, angle "Copy di Note" tapi kosong
 *
 * Output: laporan console + JSON (scripts/audit-prefilled-mismatch-report.json)
 *
 * READ-ONLY — tidak mengubah data apapun.
 * Usage: node scripts/audit-prefilled-mismatch.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import fs from "fs";

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

// ═══ Alias akronim yang dipakai tim di notes (dari sampling data) ═══
const MANUAL_ALIASES = {
  "Bolu Pisang bu Winda": ["bolpis", "bolu pisang", "bu winda", "bolupisang"],
  TPDOC: ["tpdoc", "pajak"],
  "Seminar Kit Kulit": ["seminar", "seminar kit", "seminar kulit"],
  Threenine: ["threenine", "three nine", "39:"],
  RMODA: ["rmoda"],
  "EJA Tour & Travel": ["eja"],
  Anurakti: ["anurakti"],
  "AUM Apparel": ["aum"],
  Hadona: ["hadona"],
  EOP: ["eop"],
  Yourbestdeal: ["yourbestdeal", "ybd"],
};

// kata generik yang TIDAK boleh jadi keyword brand (terlalu umum)
const GENERIC_WORDS = new Set([
  "tour", "travel", "agency", "apparel", "studio", "workshop", "kit",
  "kulit", "travel", "haji", "umroh", "the", "and", "dan",
]);

function normalizeName(name) {
  return String(name || "").trim();
}

function buildKeywords(clientNames) {
  // keyword → clientName
  const kw2client = new Map();
  const add = (kw, client) => {
    const k = kw.toLowerCase().trim();
    if (k.length < 3) return; // hindari keyword terlalu pendek (mis. "eop" ok krn 3)
    if (!kw2client.has(k)) kw2client.set(k, client);
  };
  for (const name of clientNames) {
    const n = normalizeName(name);
    add(n, n);
    // pecah per kata (biar tangkap variasi), skip kata generik/pendek
    for (const w of n.split(/[\s&,.]+/)) {
      const word = w.trim();
      if (word.length >= 4 && !GENERIC_WORDS.has(word.toLowerCase())) {
        add(word, n);
      }
    }
    // alias manual
    for (const alias of MANUAL_ALIASES[n] || []) add(alias, n);
  }
  // alias manual utk nama yang mungkin tidak persis sama dgn sheet
  for (const [name, aliases] of Object.entries(MANUAL_ALIASES)) {
    for (const alias of aliases) add(alias, name);
  }
  return kw2client;
}

// Canonical brand grouping — sheet berbeda tapi BISNIS sama
// (RMODA Workshop / RMODA autospa KG / RMODA studio BSD = satu brand RMODA;
//  Seminar Kulit & Seminar Kit Kulit = satu bisnis)
function canonicalBrand(clientName) {
  const n = String(clientName || "").toLowerCase();
  if (n.includes("rmoda")) return "RMODA";
  if (n.includes("seminar")) return "Seminar Kulit";
  if (n.includes("hadona")) return "Hadona";
  return String(clientName || "").trim();
}

function detectBrands(text, kw2client, ownClient) {
  const t = ` ${String(text || "").toLowerCase()} `;
  const ownCanonical = canonicalBrand(ownClient);
  const found = new Set();
  for (const [kw, client] of kw2client) {
    if (t.includes(kw)) {
      const c = canonicalBrand(client);
      // hanya mismatch jika brand beda bisnis (bukan sesama grup RMODA/Seminar)
      if (c !== ownCanonical) found.add(c);
    }
  }
  return [...found];
}

async function main() {
  console.log("🔍 AUDIT SEMANTIK: Prefilled/Caption vs Client Pemilik Row\n");

  // 1. Ambil semua rows master
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("ads_content_clusters")
      .select(
        "id, source_sheet, sheet_row, client_id, client_hint, theme, caption, content_copy, result_link"
      )
      .like("source_sheet", "master|%")
      .order("source_sheet")
      .order("sheet_row")
      .range(from, from + 199);
    if (error) {
      console.error("❌ DB error:", error.message);
      process.exit(1);
    }
    all.push(...(data || []));
    if (!data || data.length < 200) break;
    from += 200;
  }

  // 2. Daftar client (dari nama sheet)
  const clientNames = [...new Set(all.map((r) => r.source_sheet.split("|")[1]))];
  const kw2client = buildKeywords(clientNames);
  console.log(`Rows master      : ${all.length}`);
  console.log(`Client sheets    : ${clientNames.length}`);
  console.log(`Brand keywords   : ${kw2client.size}\n`);

  // 3. Scan setiap row
  const report = {
    generatedAt: new Date().toISOString(),
    totalRows: all.length,
    clients: clientNames,
    mismatches: [],
    crossClientDuplicates: [],
    emptyAngleNoteIssues: [],
    summary: { okRows: 0, mismatchRows: 0, prefilledMismatch: 0, captionMismatch: 0 },
  };

  // deteksi duplikat prefilled lintas client
  const prefilledOwners = new Map(); // text → Set(clients)

  for (const r of all) {
    const client = r.source_sheet.split("|")[1];
    const issues = [];

    // prefilled mismatch
    if (r.content_copy && r.content_copy.trim()) {
      const brands = detectBrands(r.content_copy, kw2client, client);
      if (brands.length) {
        issues.push({
          field: "prefilled (content_copy)",
          detectedBrands: brands,
          text: r.content_copy,
        });
        report.summary.prefilledMismatch++;
      }
      // duplikat lintas client
      const key = r.content_copy.trim().toLowerCase().slice(0, 200);
      if (!prefilledOwners.has(key)) prefilledOwners.set(key, new Set());
      prefilledOwners.get(key).add(client);
    }

    // caption mismatch
    if (r.caption && r.caption.trim()) {
      const brands = detectBrands(r.caption, kw2client, client);
      if (brands.length) {
        issues.push({ field: "caption", detectedBrands: brands, text: r.caption });
        report.summary.captionMismatch++;
      }
    }

    // angle "Copy di Note" tapi caption+prefilled kosong
    if (/copy di note/i.test(r.theme || "")) {
      const hasCap = r.caption && r.caption.trim();
      const hasPref = r.content_copy && r.content_copy.trim();
      if (!hasCap && !hasPref) {
        report.emptyAngleNoteIssues.push({
          client,
          sheet_row: r.sheet_row,
          theme: r.theme,
        });
      }
    }

    if (issues.length) {
      report.summary.mismatchRows++;
      report.mismatches.push({
        id: r.id,
        client,
        sheet_row: r.sheet_row,
        client_hint: r.client_hint,
        theme: r.theme,
        caption: r.caption ? r.caption.slice(0, 120) : null,
        content_copy: r.content_copy ? r.content_copy.slice(0, 160) : null,
        issues,
      });
    } else {
      report.summary.okRows++;
    }
  }

  // duplikat lintas client
  for (const [text, owners] of prefilledOwners) {
    if (owners.size > 1) {
      report.crossClientDuplicates.push({
        owners: [...owners],
        textPreview: text.slice(0, 100),
      });
    }
  }

  // 4. Print laporan
  console.log("═══ RINGKASAN ═══");
  console.log(`Rows bersih (OK)            : ${report.summary.okRows}`);
  console.log(`Rows MISMATCH ⚠️            : ${report.summary.mismatchRows}`);
  console.log(`  - prefilled salah client  : ${report.summary.prefilledMismatch}`);
  console.log(`  - caption salah client    : ${report.summary.captionMismatch}`);
  console.log(`Angle 'Copy di Note' kosong : ${report.emptyAngleNoteIssues.length}`);
  console.log(`Prefilled duplikat lintas client : ${report.crossClientDuplicates.length}\n`);

  // per client
  const perClient = new Map();
  for (const m of report.mismatches) {
    perClient.set(m.client, (perClient.get(m.client) || 0) + 1);
  }
  console.log("═══ MISMATCH PER CLIENT ═══");
  for (const [c, n] of [...perClient.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${c}: ${n} rows`);
  }

  console.log("\n═══ DETAIL MISMATCH (maks 40) ═══");
  for (const m of report.mismatches.slice(0, 40)) {
    console.log(`\n[${m.client} r${m.sheet_row}] angle: ${(m.theme || "-").slice(0, 40)}`);
    for (const iss of m.issues) {
      console.log(`  ❌ ${iss.field} → terdeteksi brand: ${iss.detectedBrands.join(", ")}`);
      console.log(`     "${String(iss.text).replace(/\n/g, " ").slice(0, 110)}"`);
    }
  }

  if (report.crossClientDuplicates.length) {
    console.log("\n═══ PREFILLED DUPLIKAT LINTAS CLIENT ═══");
    for (const d of report.crossClientDuplicates.slice(0, 15)) {
      console.log(`  [${d.owners.join(" ⇄ ")}] "${d.textPreview}..."`);
    }
  }

  // 5. Simpan JSON
  const outPath = "scripts/audit-prefilled-mismatch-report.json";
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Laporan lengkap: ${outPath} (${report.mismatches.length} mismatch)`);

  if (report.summary.mismatchRows === 0) {
    console.log("\n✅ Tidak ada mismatch terdeteksi.");
  } else {
    console.log(
      `\n❌ ${report.summary.mismatchRows} rows perlu dibersihkan (lihat JSON untuk detail lengkap).`
    );
  }
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});