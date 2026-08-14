/**
 * Playwright Audit: Task Board height issue
 * Login to workspace.hadona.id/tasks and screenshot board view
 * to verify if columns are too long
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "tasks-board-audit");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Create screenshot directory
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // === STEP 1: Login ===
    console.log("🔐 Logging in...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);

    // Fill email
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.count()) {
      await emailInput.fill(EMAIL);
    }

    // Fill password
    const pwdInput = page.locator('input[type="password"], input[name="password"]');
    if (await pwdInput.count()) {
      await pwdInput.fill(PASSWORD);
    }

    // Click submit
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
    if (await submitBtn.count()) {
      await submitBtn.first().click();
    }

    await sleep(4000);

    // Check if still on login page
    if (page.url().includes("/login")) {
      console.log("⚠️ Still on login page, trying alternate method...");
      await sleep(3000);
    }

    // === STEP 2: Navigate to Tasks ===
    console.log("📋 Navigating to /tasks...");
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);

    // === STEP 3: Ensure Board view is active ===
    console.log("📊 Ensuring Board view...");
    const boardBtn = page.locator('button:has-text("Board")');
    if (await boardBtn.count()) {
      await boardBtn.first().click();
      await sleep(2000);
    }

    // === STEP 4: Desktop screenshot (1440x900) ===
    console.log("📸 Taking desktop screenshot...");
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(2000);

    // Measure page metrics
    const metrics = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const board = document.querySelector('[class*="overflow-x-auto"]') || document.querySelector('[class*="grid"]');
      const columns = document.querySelectorAll('[class*="border-t-4"]');
      const cards = document.querySelectorAll('[class*="cursor-pointer"][class*="rounded-md"][class*="border-border"]');

      return {
        bodyScrollHeight: body.scrollHeight,
        bodyClientHeight: body.clientHeight,
        htmlScrollHeight: html.scrollHeight,
        viewportHeight: window.innerHeight,
        columnCount: columns.length,
        cardCount: cards.length,
        columnHeights: Array.from(columns).map((c) => ({
          offsetHeight: c.offsetHeight,
          scrollHeight: c.scrollHeight,
        })),
      };
    });

    console.log("📊 Metrics:", JSON.stringify(metrics, null, 2));

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01-board-desktop.png"),
      fullPage: false,
    });

    // Full page screenshot
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02-board-fullpage.png"),
      fullPage: true,
    });

    // === STEP 5: Mobile screenshot ===
    console.log("📱 Taking mobile screenshot...");
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(2000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "03-board-mobile.png"),
      fullPage: false,
    });

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04-board-mobile-fullpage.png"),
      fullPage: true,
    });

    // === STEP 6: Count cards per column ===
    console.log("🔢 Counting cards per column...");
    const cardData = await page.evaluate(() => {
      const columns = document.querySelectorAll('[class*="border-t-4"]');
      const result = [];
      columns.forEach((col, i) => {
        const label = col.querySelector("span.text-sm")?.textContent || `Column ${i}`;
        const badge = col.querySelector(".badge")?.textContent || "0";
        const cards = col.querySelectorAll('[class*="cursor-pointer"]');
        result.push({
          label: label.trim(),
          badge: badge.trim(),
          cardCount: cards.length,
          colHeight: col.offsetHeight,
          colScrollHeight: col.scrollHeight,
        });
      });
      return result;
    });
    console.log("📊 Card data per column:", JSON.stringify(cardData, null, 2));

    // === STEP 7: Switch to Table view ===
    console.log("📋 Testing Table view...");
    await page.setViewportSize({ width: 1440, height: 900 });
    const tableBtn = page.locator('button:has-text("Table")');
    if (await tableBtn.count()) {
      await tableBtn.first().click();
      await sleep(2000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "05-table-desktop.png"),
        fullPage: false,
      });
    }

    // === STEP 8: Switch to Analytics view ===
    console.log("📈 Testing Analytics view...");
    const analyticsBtn = page.locator('button:has-text("Analytics")');
    if (await analyticsBtn.count()) {
      await analyticsBtn.first().click();
      await sleep(3000);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "06-analytics-desktop.png"),
        fullPage: false,
      });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "07-analytics-fullpage.png"),
        fullPage: true,
      });
    }

    console.log("✅ Audit complete! Screenshots saved to:", SCREENSHOT_DIR);
    console.log("\n📊 SUMMARY:");
    console.log(`   - Page scroll height: ${metrics.htmlScrollHeight}px`);
    console.log(`   - Viewport height: ${metrics.viewportHeight}px`);
    console.log(`   - Columns: ${metrics.columnCount}`);
    console.log(`   - Total cards: ${metrics.cardCount}`);
    console.log(`   - Issue: ${metrics.htmlScrollHeight > metrics.viewportHeight + 200 ? "YES - page too long" : "NO - fits viewport"}`);

    // Write metrics to file
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, "metrics.json"),
      JSON.stringify({ metrics, cardData }, null, 2)
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "error.png") }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);