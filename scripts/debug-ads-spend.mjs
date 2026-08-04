import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://workspace.hadona.id";
const LOGIN_EMAIL = "admin@hadona.id";
const LOGIN_PASSWORD = "@Yogyakarta2026";

const SCREENSHOT_DIR = "scripts/screenshots/debug-ads-spend";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "id-ID",
  });

  // Capture API responses
  const apiResponses = [];
  context.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/") || url.includes("/supabase") || url.includes("rest/v1")) {
      try {
        const status = response.status();
        const body = await response.text();
        apiResponses.push({
          url: url.substring(0, 120),
          status,
          body: body.substring(0, 500),
        });
      } catch {
        apiResponses.push({ url: url.substring(0, 120), status: response.status(), body: "N/A" });
      }
    }
  });

  const page = await context.newPage();

  // Capture console logs
  const consoleLogs = [];
  page.on("console", (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`[ERROR] ${err.message}`));

  console.log("=== Step 1: Login ===");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });

  // Fill login form
  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASSWORD);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-login-filled.png`, fullPage: true });

  // Click login button
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-after-login.png`, fullPage: true });

  console.log("Current URL after login:", page.url());

  console.log("=== Step 2: Navigate to Ads Spend ===");
  await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-ads-spend-full.png`, fullPage: true });

  // Get page text content for analysis
  const pageContent = await page.content();

  // Check for Sync Now button
  const syncButton = await page.locator("button:has-text('Sync Now')").first();
  const syncButtonExists = await syncButton.count();
  let syncButtonInfo = "NOT FOUND";
  if (syncButtonExists > 0) {
    const isDisabled = await syncButton.isDisabled();
    const buttonText = await syncButton.textContent();
    const buttonClass = await syncButton.getAttribute("class");
    const buttonTitle = await syncButton.getAttribute("title");
    syncButtonInfo = JSON.stringify(
      { text: buttonText, disabled: isDisabled, class: buttonClass, title: buttonTitle },
      null,
      2
    );
  }

  // Check for KPI values
  const kpiValues = await page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="card"], [class*="kpi"], [class*="metric"]');
    return Array.from(cards)
      .map((c) => c.textContent?.trim().substring(0, 100))
      .filter((t) => t && t.length > 0)
      .slice(0, 20);
  });

  // Check for "0" values in the page
  const zeroValues = await page.evaluate(() => {
    const allElements = document.querySelectorAll("*");
    const zeros = [];
    for (const el of allElements) {
      const text = el.textContent?.trim();
      if (text === "Rp 0" || text === "0" || text === "0,00%" || text === "Rp0") {
        zeros.push({
          tag: el.tagName,
          class: el.className?.substring(0, 80),
          text,
        });
      }
    }
    return zeros.slice(0, 20);
  });

  // Check for token status indicators
  const tokenStatus = await page.evaluate(() => {
    const html = document.body.innerHTML;
    const indicators = {
      hasTokenInvalid: html.includes("Token invalid") || html.includes("token_invalid"),
      hasReconnect: html.includes("Reconnect"),
      hasConnected: html.includes("berhasil terhubung") || html.includes("Connected"),
      hasNoConnection: html.includes("Belum terhubung") || html.includes("Connect Meta"),
      hasAlertCircle: html.includes("AlertCircle") || html.includes("alert-circle"),
      hasCheckCircle: html.includes("CheckCircle") || html.includes("check-circle"),
      hasLoadingSpinner: html.includes("Loader2") || html.includes("animate-spin"),
      hasSpendData: html.includes("spend") || html.includes("Spend"),
      hasNoData: html.includes("Tidak ada data") || html.includes("Belum ada data"),
    };
    return indicators;
  });

  // Check meta_connection data from the page state (React state via DOM)
  const metaConnectionInfo = await page.evaluate(() => {
    // Try to find any text that shows connection status
    const connectionBanner = document.querySelector('[class*="border-danger"], [class*="bg-danger/5"]');
    const statusText = connectionBanner?.textContent?.trim().substring(0, 200);

    // Check for ad account count
    const adAccountText = document.body.textContent?.match(/(\d+)\s*(?:ad account|akun|account)/i)?.[0];

    return {
      statusBanner: statusText || "none",
      adAccountMention: adAccountText || "none",
    };
  });

  // Check the "Reconnect dengan Token" button
  const reconnectButton = await page.locator("button:has-text('Reconnect')").count();

  // Check for "Connect dengan Token" / "Connect Meta" button (means no connection)
  const connectButton = await page.locator("button:has-text('Connect')").count();

  // Full DOM analysis for the connection status section
  const connectionSection = await page.evaluate(() => {
    // Find the card that contains sync button or connect button
    const cards = document.querySelectorAll(".card, [class*='rounded-lg border']");
    for (const card of cards) {
      const text = card.textContent || "";
      if (
        text.includes("Sync Now") ||
        text.includes("Connect") ||
        text.includes("Meta") ||
        text.includes("Token") ||
        text.includes("Token invalid") ||
        text.includes("Reconnect")
      ) {
        return text.trim().substring(0, 1000);
      }
    }
    return "No connection section found";
  });

  console.log("\n=== DIAGNOSTIC RESULTS ===\n");
  console.log("Sync Button Info:", syncButtonInfo);
  console.log("\nReconnect Button count:", reconnectButton);
  console.log("Connect Button count:", connectButton);
  console.log("\nToken Status:", JSON.stringify(tokenStatus, null, 2));
  console.log("\nMeta Connection Info:", JSON.stringify(metaConnectionInfo, null, 2));
  console.log("\nConnection Section Text:", connectionSection);
  console.log("\nKPI Values:", JSON.stringify(kpiValues, null, 2));
  console.log("\nZero Values found:", JSON.stringify(zeroValues, null, 2));
  console.log("\nConsole Logs:", consoleLogs.slice(0, 20).join("\n"));

  // Save all API responses related to meta/supabase
  const metaApiResponses = apiResponses.filter(
    (r) => r.url.includes("meta") || r.url.includes("meta_connections") || r.url.includes("ad_accounts") || r.url.includes("ad_spend")
  );
  console.log("\nMeta/Ads API Responses:", JSON.stringify(metaApiResponses, null, 2));

  // Save results to JSON
  const results = {
    timestamp: new Date().toISOString(),
    currentUrl: page.url(),
    syncButtonInfo,
    reconnectButton,
    connectButton,
    tokenStatus,
    metaConnectionInfo,
    connectionSection,
    kpiValues,
    zeroValues,
    consoleLogs: consoleLogs.slice(0, 30),
    apiResponses: metaApiResponses,
  };
  fs.writeFileSync(`${SCREENSHOT_DIR}/diagnostic-results.json`, JSON.stringify(results, null, 2));

  await browser.close();
  console.log("\n=== Screenshots saved to:", SCREENSHOT_DIR, "===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});