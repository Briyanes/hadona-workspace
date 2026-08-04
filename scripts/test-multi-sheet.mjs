/**
 * 🧪 Test Multi-Sheet Parser
 * ============================================================================
 * Test fetch & parse SEMUA sheet tabs dari published Google Spreadsheet.
 * Verifikasi bahwa semua 7 bulan (Januari-Juli '26) bisa di-parse.
 */

import { fetchAndParseAllSheets, discoverSheets } from "../src/lib/sheet-parser.ts";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv";

async function main() {
  console.log("═".repeat(60));
  console.log("📋 Step 1: Discover semua sheet tabs");
  console.log("═".repeat(60));
  const tabs = await discoverSheets(SHEET_URL);
  console.log(`✅ Ditemukan ${tabs.length} sheet tabs:\n`);
  for (const t of tabs) {
    console.log(`   • gid=${t.gid.padEnd(12)} → "${t.name}"`);
  }
  console.log("");

  console.log("═".repeat(60));
  console.log("📊 Step 2: Fetch & parse semua sheet");
  console.log("═".repeat(60));
  const result = await fetchAndParseAllSheets(SHEET_URL);
  console.log(`\n📈 Aggregate Stats:`);
  console.log(`   Total raw rows   : ${result.totalRows}`);
  console.log(`   Total parsed rows: ${result.totalParsed}`);
  console.log(`   Errors           : ${result.errors.length}`);
  console.log("");

  console.log("═".repeat(60));
  console.log("📋 Per-Sheet Breakdown:");
  console.log("═".repeat(60));
  for (const sheet of result.sheets) {
    console.log(`\n  📅 "${sheet.name}" (gid=${sheet.gid})`);
    console.log(`     Raw rows : ${sheet.rows.length}`);
    console.log(`     Parsed   : ${sheet.parsed.totalRows}`);
    console.log(`     Errors   : ${sheet.parsed.errors.length}`);

    // Show first row sample
    if (sheet.parsed.rows.length > 0) {
      const sample = sheet.parsed.rows[0];
      console.log(`     Sample   : "${sample.clientName}" | ${sample.platform} | ${sample.detectedObjective}`);
      console.log(`                Period: ${sample.periodStart?.toISOString().split("T")[0]} → ${sample.periodEnd?.toISOString().split("T")[0]}`);
      console.log(`                Metrics: ${sample.metrics.length}`);
    }

    // Aggregate platform & objective distribution
    const platforms = {};
    const objectives = {};
    for (const r of sheet.parsed.rows) {
      platforms[r.platform] = (platforms[r.platform] || 0) + 1;
      if (r.detectedObjective) {
        objectives[r.detectedObjective] = (objectives[r.detectedObjective] || 0) + 1;
      }
    }
    console.log(`     Platforms: ${JSON.stringify(platforms)}`);
    console.log(`     Objectives: ${JSON.stringify(objectives)}`);
  }

  // Global aggregate
  const allRows = result.sheets.flatMap((s) => s.parsed.rows);
  const globalPlatforms = {};
  const globalObjectives = {};
  const globalStatus = {};
  let totalMetrics = 0;
  for (const r of allRows) {
    globalPlatforms[r.platform] = (globalPlatforms[r.platform] || 0) + 1;
    if (r.detectedObjective) {
      globalObjectives[r.detectedObjective] = (globalObjectives[r.detectedObjective] || 0) + 1;
    }
    globalStatus[r.status] = (globalStatus[r.status] || 0) + 1;
    totalMetrics += r.metrics.length;
  }

  console.log("\n" + "═".repeat(60));
  console.log("🌍 Global Aggregate (semua 7 bulan):");
  console.log("═".repeat(60));
  console.log(`   Total weekly reports : ${allRows.length}`);
  console.log(`   Total metrics        : ${totalMetrics} (avg ${(totalMetrics / Math.max(allRows.length, 1)).toFixed(1)}/row)`);
  console.log(`   Platform distribution: ${JSON.stringify(globalPlatforms)}`);
  console.log(`   Objective distribution: ${JSON.stringify(globalObjectives)}`);
  console.log(`   Status distribution  : ${JSON.stringify(globalStatus)}`);

  // Verify CTWA detection (sample)
  const ctwaRows = allRows.filter((r) => r.detectedObjective === "META_CTWA");
  console.log(`\n   CTWA rows: ${ctwaRows.length} (akan tampil Cost/Msg di card, BUKAN ROAS)`);
  if (ctwaRows.length > 0) {
    const sample = ctwaRows[0];
    console.log(`   Sample CTWA metrics:`);
    for (const m of sample.metrics) {
      console.log(`     • ${m.rawLabel} → ${m.key} = ${m.value} (${m.unit})`);
    }
  }

  if (result.errors.length > 0) {
    console.log("\n⚠️ Errors:");
    for (const e of result.errors) console.log(`   • ${e}`);
  }

  console.log("\n✅ Test selesai!");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});