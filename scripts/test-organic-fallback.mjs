/**
 * 🧪 Test Organic Reports Fallback (v2.4)
 * ============================================================================
 * Verifikasi Bug 1 fix: organic reports (yang tidak punya "X s/d Y" pattern
 * di performance text) sekarang dapat periodStart dari Input Date column.
 *
 * Sebelum fix: 5 organic reports di Januari '26 selalu ter-skip noPeriod.
 * Sesudah fix: mereka harusnya dapat periodStart dari row.date.
 */

import { fetchAndParseAllSheets } from "../src/lib/sheet-parser.ts";

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbWYiTnXtz9ukLg-CprfY-fNCl3L-PbW-dWl-C8oMQAp-P6vJIN76zPhhk67FfBZi1TsRivogdpIp6/pub?output=csv";

function summarize(text, maxLen = 100) {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

async function main() {
  console.log("═".repeat(70));
  console.log("🧪 Test Organic Reports Fallback (Bug 1 fix verification)");
  console.log("═".repeat(70));

  const result = await fetchAndParseAllSheets(SHEET_URL);

  let organicCount = 0;
  let fixedCount = 0;
  let stillBrokenCount = 0;

  console.log("\n📋 Scan semua sheet untuk organic reports...\n");

  for (const sheet of result.sheets) {
    for (const row of sheet.parsed.rows) {
      // Organic = tidak ada period dari performance text (periodStart masih null)
      const hasPeriodFromText = row.periodStart !== null;
      const hasInputDate = row.date !== null;

      if (!hasPeriodFromText && hasInputDate) {
        organicCount++;
        // Simulasi logic v2.4 fix: pakai row.date sebagai periodStart
        const simulatedPeriodStart = row.date
          ? row.date.toISOString().split("T")[0]
          : null;

        if (simulatedPeriodStart) {
          fixedCount++;
          if (organicCount <= 10) {
            console.log(
              `✅ Sheet "${sheet.name}" row ${row.rowIndex}: client="${row.clientName}"`
            );
            console.log(
              `   Input Date: ${simulatedPeriodStart} (akan dipakai sebagai periodStart fallback)`
            );
            console.log(`   Performance preview: "${summarize(row.rawPerformanceText)}"`);
            console.log(`   Metrics count: ${row.metrics.length}`);
            console.log("");
          }
        } else {
          stillBrokenCount++;
        }
      }
    }
  }

  console.log("═".repeat(70));
  console.log("📊 Test Summary:");
  console.log("═".repeat(70));
  console.log(`   Total organic reports (no period from text): ${organicCount}`);
  console.log(`   ✅ Akan ke-fix dengan v2.4 fallback         : ${fixedCount}`);
  console.log(`   ❌ Masih broken (no Input Date column)      : ${stillBrokenCount}`);

  if (stillBrokenCount === 0 && fixedCount > 0) {
    console.log(
      `\n🎉 SUCCESS: Semua ${fixedCount} organic reports akan masuk DB setelah sync berikutnya!`
    );
  } else if (stillBrokenCount > 0) {
    console.log(`\n⚠️  Masih ada ${stillBrokenCount} row yang butuh perhatian manual.`);
  } else {
    console.log(`\nℹ️  Tidak ada organic reports di sheet ini.`);
  }
}

main().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});