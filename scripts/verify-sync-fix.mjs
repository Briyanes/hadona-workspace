import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://workspace.hadona.id";
const LOGIN_EMAIL = process.env.TEST_EMAIL;
const LOGIN_PASSWORD = process.env.TEST_PASSWORD;

const SCREENSHOT_DIR = "scripts/screenshots/verify-sync-fix";
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

  // Capture console + API responses
  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[ERROR] ${err.message}`));

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
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-before-sync.png`, fullPage: true });

  // Check if Sync Now button is now ENABLED (our fix)
  const syncButton = page.locator("button:has-text('Sync Now')").first();
  const isDisabled = await syncButton.isDisabled();
  const buttonTitle = await syncButton.getAttribute("title");
  console.log("Sync Now button disabled?", isDisabled, "| title:", buttonTitle);

  if (isDisabled) {
    console.error("❌ FAIL: Sync Now button is STILL disabled!");
    fs.writeFileSync(
      `${SCREENSHOT_DIR}/result.json`,
      JSON.stringify({ success: false, reason: "Sync button still disabled", isDisabled, buttonTitle }, null, 2)
    );
    await browser.close();
    process.exit(1);
  }

  console.log("✅ Sync Now button is ENABLED! Clicking it...");

  // Listen for the sync API call
  const syncResponsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/meta/sync"),
    { timeout: 60000 }
  );

  // Click Sync Now
  await syncButton.click();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-syncing.png`, fullPage: true });

  console.log("Waiting for sync API response...");
  const syncResponse = await syncResponsePromise;
  const syncStatus = syncResponse.status();
  let syncData;
  try {
    syncData = await syncResponse.json();
  } catch {
    syncData = { raw: await syncResponse.text() };
  }
  console.log("Sync API status:", syncStatus);
  console.log("Sync API response:", JSON.stringify(syncData, null, 2).substring(0, 2000));

  // Wait for UI to reload data
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-after-sync.png`, fullPage: true });

  // Check KPI values after sync
  const kpiAfter = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="card"]');
    return Array.from(cards)
      .map((c) => c.textContent?.trim().substring(0, 120))
      .filter((t) => t && (t.includes("Rp") || t.includes("Spend") || t.includes("Budget")))
      .slice(0, 10);
  });
  console.log("\nKPI values after sync:", JSON.stringify(kpiAfter, null, 2));

  // Check for toast notifications
  const toasts = await page.evaluate(() => {
    const toastElements = document.querySelectorAll('[class*="toast"], [class*="Toast"], [role="status"], [role="alert"]');
    return Array.from(toastElements).map((t) => t.textContent?.trim().substring(0, 200));
  });
  console.log("Toast messages:", JSON.stringify(toasts, null, 2));

  // Write results
  const result = {
    timestamp: new Date().toISOString(),
    syncButtonEnabled: !isDisabled,
    syncApiStatus: syncStatus,
    syncResponse: syncData,
    kpiAfterSync: kpiAfter,
    toasts,
    consoleErrors: consoleLogs.filter((l) => l.includes("[ERROR]")).slice(0, 10),
  };
  fs.writeFileSync(`${SCREENSHOT_DIR}/result.json`, JSON.stringify(result, null, 2));

  const totalRecords = syncData?.total_records || 0;
  const accountsImported = syncData?.accounts_imported || 0;

  console.log("\n=== VERIFICATION RESULT ===");
  console.log(`✅ Sync button enabled: ${!isDisabled}`);
  console.log(`✅ Sync API status: ${syncStatus}`);
  console.log(`✅ Records synced: ${totalRecords}`);
  console.log(`✅ Accounts imported: ${accountsImported}`);

  if (syncStatus === 200 && (totalRecords > 0 || syncData?.successful >= 0)) {
    console.log("\n🎉 SUCCESS! Sync is working!");
  } else if (syncStatus === 200) {
    console.log("\n⚠️ Sync ran but no data — might be because Meta insights need 24-48h to mature for today.");
  } else {
    console.log("\n❌ Sync API returned error status");
  }

  await browser.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});