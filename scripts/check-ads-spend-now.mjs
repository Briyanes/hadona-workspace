import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://workspace.hadona.id";
const LOGIN_EMAIL = "admin@hadona.id";
const LOGIN_PASSWORD = "@Yogyakarta2026";

const SCREENSHOT_DIR = "scripts/screenshots/check-now";
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

  console.log("=== Step 1: Login ===");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', LOGIN_EMAIL);
  await page.fill('input[type="password"]', LOGIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  console.log("URL after login:", page.url());

  console.log("=== Step 2: Navigate to Ads Spend ===");
  await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);

  // Take full page screenshot
  await page.screenshot({ path: `${SCREENSHOT_DIR}/ads-spend-full.png`, fullPage: true });
  console.log("Screenshot saved to scripts/screenshots/check-now/ads-spend-full.png");

  // Extract KPI data
  const pageData = await page.evaluate(() => {
    const body = document.body.innerText;

    // Get KPI cards
    const cards = document.querySelectorAll('[class*="card"], [class*="rounded"][class*="border"]');
    const kpiData = Array.from(cards)
      .map((c) => c.textContent?.trim().substring(0, 200))
      .filter((t) => t && (t.includes("Rp") || t.includes("Spend") || t.includes("Budget") || t.includes("ROAS") || t.includes("Alert")))
      .slice(0, 10);

    // Get table rows count
    const rows = document.querySelectorAll("table tbody tr");

    // Get Meta connection status
    const metaSection = document.querySelector('[class*="meta"], [class*="connection"]');
    const metaText = metaSection?.textContent?.trim().substring(0, 300) || "N/A";

    return {
      kpiData,
      tableRows: rows.length,
      metaStatus: metaText,
      url: window.location.href,
      title: document.title,
    };
  });

  console.log("\n=== PAGE DATA ===");
  console.log("URL:", pageData.url);
  console.log("Title:", pageData.title);
  console.log("Table rows:", pageData.tableRows);
  console.log("\nKPI Data:");
  pageData.kpiData.forEach((kpi, i) => console.log(`  [${i}] ${kpi}`));
  console.log("\nMeta Status:", pageData.metaStatus);

  // Also check the chart area for any visible data
  const chartData = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    if (!svg) return { hasChart: false };
    const paths = svg.querySelectorAll("path");
    return {
      hasChart: true,
      pathCount: paths.length,
      svgWidth: svg.getAttribute("width") || svg.getBoundingClientRect().width,
      svgHeight: svg.getAttribute("height") || svg.getBoundingClientRect().height,
    };
  });
  console.log("\nChart Data:", JSON.stringify(chartData, null, 2));

  // Check for any error messages
  const errors = await page.evaluate(() => {
    const errorElements = document.querySelectorAll('[class*="error"], [class*="danger"], [class*="red"]');
    return Array.from(errorElements)
      .map((e) => e.textContent?.trim().substring(0, 100))
      .filter((t) => t && t.length > 5)
      .slice(0, 5);
  });
  if (errors.length > 0) {
    console.log("\n⚠️ Error elements found:");
    errors.forEach((e) => console.log(`  - ${e}`));
  } else {
    console.log("\n✅ No error elements found");
  }

  fs.writeFileSync(`${SCREENSHOT_DIR}/page-data.json`, JSON.stringify(pageData, null, 2));

  await browser.close();
  console.log("\n✅ Done! Check scripts/screenshots/check-now/ads-spend-full.png");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});