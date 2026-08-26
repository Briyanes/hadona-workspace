#!/usr/bin/env node
/**
 * debug-skipped.mjs
 * ────────────────────────────────────────────────────────────────────────────
 * Diagnose mendalam kenapa row di-skip saat sync dari Google Sheet.
 *
 * Strategi:
 *  1. Download semua sheet tab dari published Google Sheet
 *  2. Untuk setiap row, klasifikasikan: noClient | noPeriod | noMetrics | dedup
 *  3. Bandingkan dengan DB supabase (weekly_reports) untuk verifikasi dedup
 *  4. Cetak ringkasan + contoh per-kategori
 *
 * Usage:
 *   node scripts/debug-skipped.mjs
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/debug-skipped.mjs
 *
 * Output: laporan ke stdout (dapat di-pipe ke file)
 */

import { config } from "dotenv";
config({ path: ".env.local" }); // load NEXT_PUBLIC_SUPABASE_URL dsb

// ─── Config ──────────────────────────────────────────────────────────────
const SHEET_BASE = process.env.GOOGLE_SHEET_BASE_URL ||
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub";

// 7 tab Januari '26 – Juli '26 (gid stabil dari publish-to-web)
const SHEET_TABS = [
  { name: "Januari", gid: "0" },
  { name: "Februari", gid: "1362579545" },
  { name: "Maret", gid: "1433349334" },
  { name: "April", gid: "1176841454" },
  { name: "Mei", gid: "920081064" },
  { name: "Juni", gid: "1905574849" },
  { name: "Juli", gid: "901234567" }, // akan di-skip kalau 404
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// ─── Helpers ─────────────────────────────────────────────────────────────
async function fetchCSV(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${url}`);
  return await res.text();
}

function parseCSVLine(line) {
  // Simple CSV parser (handles quoted fields with commas)
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cells.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  cells.push(cur);
  return cells;
}

function detectPeriod(text) {
  if (!text) return null;
  // Match patterns: "1-7 Jan", "1-7 Januari", "1–7 Jan 26", "Januari Minggu 1"
  const m = text.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+([A-Za-z]+)/i);
  if (m) return `${m[1]}-${m[2]} ${m[3]}`;
  return null;
}

function hasMetrics(row) {
  // Cek apakah ada angka > 0 di selain 2 kolom pertama (client, period)
  for (let i = 2; i < row.length; i++) {
    const val = row[i]?.trim() || "";
    if (val && !isNaN(Number(val.replace(/[,\.]/g, ""))) && Number(val.replace(/[,\.]/g, "")) > 0) {
      return true;
    }
  }
  return false;
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🔍 DEBUG SKIPPED ROWS — Google Sheet Sync Diagnostic");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const stats = {
    totalRows: 0,
    noClient: 0,
    noPeriod: 0,
    noMetrics: 0,
    valid: 0,
    perSheet: [],
  };
  const examples = {
    noClient: [],
    noPeriod: [],
    noMetrics: [],
    valid: [],
  };

  // ─── Tarik DB reports untuk dedup check ──────────────────────────────
  let dbReports = [];
  if (SUPABASE_URL && SUPABASE_KEY) {
    console.log("📡 Mengambil data dari Supabase untuk cek dedup...");
    const offset = 0;
    const pageSize = 1000;
    while (true) {
      const url = `${SUPABASE_URL}/rest/weekly_reports?select=id,client_id,period_start,period_end&limit=${pageSize}&offset=${offset}`;
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      });
      if (!res.ok) {
        console.warn(`  ⚠️  Supabase HTTP ${res.status}: ${await res.text()}`);
        break;
      }
      const page = await res.json();
      dbReports.push(...page);
      if (page.length < pageSize) break;
      if (offset > 5000) break;
      break; // aman untuk <= 1000 reports
    }
    console.log(`  ✅ ${dbReports.length} reports di DB\n`);
  } else {
    console.log("⚠️  SUPABASE_URL/KEY tidak diset — skip DB dedup check\n");
  }

  // ─── Iterasi sheet tabs ──────────────────────────────────────────────
  for (const tab of SHEET_TABS) {
    const url = `${SHEET_BASE}?gid=${tab.gid}&single=true&output=csv`;
    let csv;
    try {
      csv = await fetchCSV(url);
    } catch (e) {
      console.log(`⏭️  Skip tab ${tab.name} (${e.message})`);
      continue;
    }
    const lines = csv.trim().split(/\r?\n/);
    const raw = lines.length;
    let sheetParsed = 0;
    let sheetNoClient = 0;
    let sheetNoPeriod = 0;
    let sheetNoMetrics = 0;
    let sheetValid = 0;

    for (let i = 0; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const client = (cells[0] || "").trim();
      const periodRaw = (cells[1] || "").trim();
      const period = detectPeriod(periodRaw);
      const metrics = hasMetrics(cells);

      stats.totalRows++;

      if (!client || client === "Client" || client.toLowerCase().includes("kesimpulan")) {
        sheetNoClient++;
        stats.noClient++;
        if (examples.noClient.length < 3) {
          examples.noClient.push(`[${tab.name}] row ${i + 1}: "${cells.slice(0, 4).join(" | ")}"`);
        }
        continue;
      }

      if (!period) {
        sheetNoPeriod++;
        stats.noPeriod++;
        if (examples.noPeriod.length < 3) {
          examples.noPeriod.push(`[${tab.name}] row ${i + 1}: client="${client}", period="${periodRaw}"`);
        }
        continue;
      }

      if (!metrics) {
        sheetNoMetrics++;
        stats.noMetrics++;
        if (examples.noMetrics.length < 3) {
          examples.noMetrics.push(`[${tab.name}] row ${i + 1}: client="${client}", period="${period}", no numeric metrics`);
        }
        continue;
      }

      sheetValid++;
      stats.valid++;
      sheetParsed++;
      if (examples.valid.length < 3) {
        examples.valid.push(`[${tab.name}] ${client} @ ${period}`);
      }
    }

    stats.perSheet.push({
      name: tab.name,
      gid: tab.gid,
      raw,
      parsed: sheetParsed,
      valid: sheetValid,
      noClient: sheetNoClient,
      noPeriod: sheetNoPeriod,
      noMetrics: sheetNoMetrics,
    });
    console.log(`📑 ${tab.name}: ${raw} rows → ${sheetValid} valid, ${sheetNoClient} noClient, ${sheetNoPeriod} noPeriod, ${sheetNoMetrics} noMetrics`);
  }

  // ─── Cetak laporan ───────────────────────────────────────────────────
  console.log("\n" + "═".repeat(63));
  console.log("📊 RINGKASAN AKHIR");
  console.log("═".repeat(63));
  console.log(`Total rows di-dapat:     ${stats.totalRows}`);
  console.log(`  ✅ Valid (siap sync):   ${stats.valid}`);
  console.log(`  ⚪ No Client:           ${stats.noClient}  (baris kosong/separator/header)`);
  console.log(`  ⚪ No Period:           ${stats.noPeriod}  (format tanggal tidak terdeteksi)`);
  console.log(`  ⚪ No Metrics:          ${stats.noMetrics} (baris naratif KESIMPULAN/ACTION)`);

  console.log("\n📑 Per-sheet breakdown:");
  for (const s of stats.perSheet) {
    console.log(
      `  ${s.name.padEnd(10)} raw=${String(s.raw).padStart(3)} valid=${String(s.valid).padStart(3)} skip=${s.noClient + s.noPeriod + s.noMetrics}`
    );
  }

  console.log("\n📋 Contoh per kategori:");
  console.log("\nNo Client:");
  examples.noClient.forEach((e) => console.log(`  • ${e}`));
  console.log("\nNo Period:");
  examples.noPeriod.forEach((e) => console.log(`  • ${e}`));
  console.log("\nNo Metrics:");
  examples.noMetrics.forEach((e) => console.log(`  • ${e}`));
  console.log("\nValid:");
  examples.valid.forEach((e) => console.log(`  • ${e}`));

  // ─── Bandingkan dengan DB ────────────────────────────────────────────
  if (dbReports.length > 0) {
    console.log("\n" + "═".repeat(63));
    console.log("🗄️  DB DEDUP CHECK");
    console.log("═".repeat(63));
    console.log(`Reports di DB: ${dbReports.length}`);

    // Distribusi per month
    const byMonth = {};
    dbReports.forEach((r) => {
      const m = (r.period_start || "").slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    Object.entries(byMonth)
      .sort()
      .forEach(([m, count]) => console.log(`  ${m}: ${count} reports`));
  }

  console.log("\n" + "═".repeat(63));
  console.log("✅ Diagnosa selesai. Bila 'Valid' jauh lebih besar dari imported");
  console.log("   di sync terakhir, kemungkinan masalah di matching client.");
  console.log("═".repeat(63) + "\n");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});