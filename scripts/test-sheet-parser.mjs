/**
 * 🧪 Test Sheet Parser dengan real sheet URL
 * Run: node scripts/test-sheet-parser.mjs
 *
 * Verifies:
 *   1. fetchSheetCSV works against real Google Sheet
 *   2. parseRow extracts correct fields
 *   3. Status mapping ("Send" → "submitted")
 *   4. Metrics parsed correctly (spend, CPR, CTR, etc.)
 *   5. Period extraction works
 */

import { fetchSheetCSV, parseAllRows } from "../src/lib/sheet-parser.ts";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv";

console.log("🔄 Fetching sheet...");
const rawRows = await fetchSheetCSV(SHEET_URL);
console.log(`✅ Fetched ${rawRows.length} raw rows\n`);

console.log("━".repeat(60));
console.log("🔍 Parsing...");
const result = parseAllRows(rawRows);

console.log(`📊 Parsed: ${result.rows.length} data rows`);
console.log(`⚠️  Errors: ${result.errors.length}`);
console.log(`📋 Skipped header: ${result.skippedHeader}\n`);

console.log("━".repeat(60));
console.log("📋 Sample parsed rows (first 3):\n");

result.rows.slice(0, 3).forEach((row, i) => {
  console.log(`Row #${i + 1} (idx ${row.rowIndex}):`);
  console.log(`  Client    : "${row.clientName}"`);
  console.log(`  PIC       : "${row.picName}"`);
  console.log(`  Division  : "${row.division}"`);
  console.log(`  Platform  : ${row.platform}`);
  console.log(`  Status    : "${row.status}" (raw → mapped)`);
  console.log(`  Period raw: "${row.periodRawText.slice(0, 60)}"`);
  // Pakai local date (bukan toISOString yang convert ke UTC)
  const fmt = (d) => {
    if (!d) return "(none)";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  console.log(`  Period    : ${fmt(row.periodStart)} → ${fmt(row.periodEnd)}`);
  console.log(`  Objective : ${row.detectedObjective}`);
  console.log(`  Metrics   : ${row.metrics.length}`);
  row.metrics.forEach((m) => {
    console.log(`    • ${m.rawLabel} → ${m.key} = ${m.value} (${m.unit})`);
  });
  console.log(`  Analysis  : ${row.analysisText?.slice(0, 80) || "(empty)"}...`);
  console.log(`  Warnings  : ${row.parseWarnings.length ? row.parseWarnings.join(", ") : "(none)"}`);
  console.log("");
});

console.log("━".repeat(60));
console.log("📈 Stats summary:");

const statusCounts = {};
const platformCounts = {};
let totalMetrics = 0;

result.rows.forEach((r) => {
  statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  platformCounts[r.platform] = (platformCounts[r.platform] || 0) + 1;
  totalMetrics += r.metrics.length;
});

console.log("  Status distribution :", statusCounts);
console.log("  Platform distribution:", platformCounts);
console.log("  Total metrics parsed:", totalMetrics);
console.log("  Avg metrics/row     :", (totalMetrics / result.rows.length).toFixed(1));

console.log("\n✅ Test complete!");