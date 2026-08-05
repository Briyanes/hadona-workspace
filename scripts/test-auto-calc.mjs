/**
 * 🧪 Sprint 4.7 Test: Auto-Calc Derived Metrics
 *
 * Verifies that parseRow() now enriches metrics with calculated values
 * (COS/MSG, COS/PUR, ROAS, CPC) when sheet only provides base metrics.
 *
 * Test cases:
 *   1. TPDOC: Spend Rp 455.101, MSGS 6 → expect COS/MSG = 75.850
 *   2. SHUMI: Spend 10.5jt, Purchases 392 → expect COST/PUR = 26.822
 *   3. RMODA: Spend 1.4jt, MSGS 60 → expect COS/MSG = 23.950
 *   4. Empty metrics → no calc, no crash
 */

import { parseRow } from "../src/lib/sheet-parser.ts";

function testCase(name, performanceText, expectations) {
  console.log(`\n🧪 TEST: ${name}`);
  console.log(`   Input: ${performanceText.replace(/\n/g, " | ")}`);

  const row = parseRow(["", "2026-07-15", "Test Client", "PIC", "Adv", performanceText, "", "Send"], 1, {
    date: 1,
    client: 2,
    pic: 3,
    division: 4,
    performance: 5,
    analysis: 6,
    status: 7,
  });

  const metricsMap = new Map(row.metrics.map((m) => [m.key, m]));

  let pass = true;
  for (const [key, expected] of Object.entries(expectations)) {
    const actual = metricsMap.get(key);
    if (!actual) {
      console.error(`   ❌ ${key}: MISSING (expected ${expected})`);
      pass = false;
      continue;
    }
    const diff = Math.abs(actual.value - expected);
    const tol = Math.max(1, expected * 0.01); // 1% tolerance
    if (diff > tol) {
      console.error(`   ❌ ${key}: ${actual.value} (expected ${expected}, diff=${diff.toFixed(2)})`);
      pass = false;
    } else {
      const autoCalcTag = actual.isAutoCalc ? " 🤖" : "";
      console.log(`   ✅ ${key}: ${actual.value}${autoCalcTag} (≈ ${expected})`);
    }
  }

  // Print all metrics for debugging
  console.log(`   📊 All metrics (${row.metrics.length}):`);
  for (const m of row.metrics) {
    const autoTag = m.isAutoCalc ? " 🤖" : "";
    console.log(`      - ${m.key}: ${m.value}${autoTag}`);
  }

  return pass;
}

console.log("=".repeat(70));
console.log("  Sprint 4.7: Auto-Calc Derived Metrics Test");
console.log("=".repeat(70));

let allPass = true;

// Test 1: TPDOC - COS/MSG should be auto-calculated
allPass &= testCase(
  "TPDOC (COS/MSG)",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 455.101
MSGS : 6
Cost/Msg : -
OC → WA : -`,
  {
    amount_spent: 455101,
    messaging_conversations_started: 6,
    cost_per_message: 75850.17, // 455101 / 6
  }
);

// Test 2: SHUMI - COST/PURCHASE should be auto-calculated
allPass &= testCase(
  "SHUMI (COST/PURCHASE)",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 10.500.000
Result Purchase : 392
Cost/Purchase : -`,
  {
    amount_spent: 10500000,
    purchases: 392,
    cost_per_purchase: 26785.71, // 10500000 / 392
  }
);

// Test 3: RMODA - COS/MSG with valid input
allPass &= testCase(
  "RMODA (COS/MSG)",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 1.437.000
MSGS : 60
Cost/Msg : -`,
  {
    amount_spent: 1437000,
    messaging_conversations_started: 60,
    cost_per_message: 23950, // 1437000 / 60
  }
);

// Test 4: Empty metrics (narrative row) - should not crash
allPass &= testCase(
  "Empty Metrics (no crash)",
  `Meta ADS - 12 s/d 18/7/26
Performa bagus, minggu ini naik 200%`,
  {}
);

// Test 5: ROAS calculation
allPass &= testCase(
  "ROAS Calculation",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 1.000.000
Purchase Value : Rp 3.500.000
ROAS : -`,
  {
    amount_spent: 1000000,
    purchase_value: 3500000,
    purchase_roas: 3.5, // 3500000 / 1000000
  }
);

// 🆕 Sprint 4.8: Test CTWA OC→WA fallback proxy
// Skenario: sheet only has Spend + MSGS, no Outbound Clicks
// Expected: oc_to_wa_ratio tidak bisa dihitung (karena butuh OC atau Link Clicks)
allPass &= testCase(
  "CTWA OC→WA — Tanpa Outbound Clicks (Real Sheet Hadona)",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 1.000.000
MSGS : 50
Cost/Msg : -`,
  {
    amount_spent: 1000000,
    messaging_conversations_started: 50,
    cost_per_message: 20000, // 1000000 / 50
    // oc_to_wa_ratio: tidak di-test di sini karena tidak ada OC / Link Clicks
  }
);

// 🆕 Sprint 4.8: Test CTWA OC→WA dengan alias "OC"
// Skenario: sheet pakai alias "OC" untuk Outbound Clicks
allPass &= testCase(
  "CTWA OC→WA — dengan alias 'OC' (auto-calc ratio)",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 1.000.000
MSGS : 30
OC : 200
Cost/Msg : -`,
  {
    amount_spent: 1000000,
    messaging_conversations_started: 30,
    outbound_clicks: 200,
    oc_to_wa_ratio: 15, // (30 / 200) * 100 = 15%
    cost_per_message: 33333.33, // 1000000 / 30
  }
);

// 🆕 Sprint 4.8: Test CTWA OC→WA dengan Link Clicks sebagai fallback
// Skenario: sheet tidak ada Outbound Clicks, tapi ada Link Clicks
allPass &= testCase(
  "CTWA OC→WA — fallback ke Link Clicks",
  `Meta ADS - 12 s/d 18/7/26
Spend : Rp 500.000
Result WA : 25
Link Clicks : 100`,
  {
    amount_spent: 500000,
    messaging_conversations_started: 25,
    link_clicks: 100,
    oc_to_wa_ratio: 25, // (25 / 100) * 100 = 25% (memakai link_clicks sebagai proxy)
    cost_per_message: 20000, // 500000 / 25
  }
);

console.log("\n" + "=".repeat(70));
if (allPass) {
  console.log("  ✅ ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log("  ❌ SOME TESTS FAILED");
  process.exit(1);
}