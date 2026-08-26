import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://workspace.hadona.id";
const LOGIN_EMAIL = process.env.TEST_EMAIL;
const LOGIN_PASSWORD = process.env.TEST_PASSWORD;

const SCREENSHOT_DIR = "scripts/screenshots/verify-backfill";
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "id-ID",
  });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  console.log("=== Step 1: Login ===");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  console.log("URL after login:", page.url());

  console.log("=== Step 2: Navigate to Ads Spend ===");
  await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check KPI BEFORE backfill
  const kpiBefore = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="card"]');
    return Array.from(cards)
      .map((c) => c.textContent?.trim().substring(0, 150))
      .filter((t) => t && (t.includes("Rp") || t.includes("Spend") || t.includes("Budget")))
      .slice(0, 10);
  });
  console.log("KPI BEFORE backfill:", JSON.stringify(kpiBefore, null, 2));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-before-backfill.png`, fullPage: true });

  // Step 3: Trigger sync with 7-day backfill via API directly
  console.log("\n=== Step 3: Trigger 7-day backfill sync ===");

  // Get auth cookies from the page context
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Call the sync API directly with days_back=7
  const syncResponse = await fetch(`${BASE_URL}/api/meta/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ days_back: 7 }),
  });

  const syncStatus = syncResponse.status;
  let syncData;
  try {
    syncData = await syncResponse.json();
  } catch {
    syncData = { raw: await syncResponse.text() };
  }
  console.log("Sync API status:", syncStatus);
  console.log("Sync API response:", JSON.stringify(syncData, null, 2).substring(0, 3000));

  // Step 4: Wait and reload page to see updated data
  console.log("\n=== Step 4: Reload page to check updated KPI ===");
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const kpiAfter = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="card"]');
    return Array.from(cards)
      .map((c) => c.textContent?.trim().substring(0, 150))
      .filter((t) => t && (t.includes("Rp") || t.includes("Spend") || t.includes("Budget")))
      .slice(0, 10);
  });
  console.log("KPI AFTER backfill:", JSON.stringify(kpiAfter, null, 2));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-after-backfill.png`, fullPage: true });

  // Step 5: Check the ad_spend_logs via debug API
  console.log("\n=== Step 5: Check ad_spend_logs via debug API ===");
  const debugResponse = await fetch(`${BASE_URL}/api/debug/ads-spend`, {
    headers: { Cookie: cookieHeader },
  });
  let debugData;
  try {
    debugData = await debugResponse.json();
  } catch {
    debugData = { error: "Failed to parse" };
  }
  console.log("Debug API status:", debugResponse.status);
  console.log("Debug data summary:", JSON.stringify({
    totalLogs: debugData?.summary?.total_logs || debugData?.totalLogs || "N/A",
    totalSpend: debugData?.summary?.total_spend || debugData?.totalSpend || "N/A",
    dateRange: debugData?.summary?.date_range || "N/A",
    sampleLogs: (debugData?.logs || debugData?.data || []).slice(0, 3),
  }, null, 2));

  // Write results
  const result = {
    timestamp: new Date().toISOString(),
    syncApiStatus: syncStatus,
    syncResponse: syncData,
    kpiBefore,
    kpiAfter,
    debugData: {
      totalLogs: debugData?.summary?.total_logs || debugData?.totalLogs,
      totalSpend: debugData?.summary?.total_spend || debugData?.totalSpend,
    },
    consoleErrors: consoleLogs.filter((l) => l.includes("[ERROR]")).slice(0, 10),
  };
  fs.writeFileSync(`${SCREENSHOT_DIR}/result.json`, JSON.stringify(result, null, 2));

  console.log("\n=== FINAL VERDICT ===");
  const totalRecords = syncData?.total_records || 0;
  if (totalRecords > 0) {
    console.log(`🎉 SUCCESS! ${totalRecords} records synced across ${syncData?.details?.[0]?.total_ad_accounts || 0} accounts`);
  } else if (syncData?.details?.[0]?.errors?.length > 0) {
    console.log("⚠️ Sync ran but accounts returned errors:");
    syncData.details[0].errors.slice(0, 5).forEach((e) => console.log(`  - ${e.id}: ${e.error}`));
  } else {
    console.log("⚠️ Sync ran successfully but no spend data found for the 7-day period.");
    console.log("   This could mean:");
    console.log("   1. Ad accounts have no active campaigns in the last 7 days");
    console.log("   2. Insights data not yet matured (Meta takes 24-48h)");
    console.log("   3. Token permission issue (need ads_read scope)");
  }

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});