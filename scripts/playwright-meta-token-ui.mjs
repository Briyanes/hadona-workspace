/**
 * Playwright Test — Meta Token Status UI (P19b Verification)
 * WITH REAL LOGIN authentication
 *
 * Usage: node scripts/playwright-meta-token-ui.mjs
 * Prereq: Dev server running on http://localhost:3000
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADS_PAGE = `${BASE_URL}/ads-spend`;
const LOGIN_PAGE = `${BASE_URL}/login`;
const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "meta-token-ui");

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

const results = { passed: [], failed: [], warnings: [] };

function log(type, test, detail = "") {
  const icon = type === "PASS" ? "✅" : type === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} [${type}] ${test}${detail ? " — " + detail : ""}`);
  if (type === "PASS") results.passed.push(test);
  else if (type === "FAIL") results.failed.push({ test, detail });
  else results.warnings.push({ test, detail });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Login via the actual form, returns the authenticated browser context
 */
async function loginAndGetContext(browser, viewport) {
  const ctx = await browser.newContext({
    viewport: viewport || { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // Navigate to login page
  console.log("  📝 Navigating to login page...");
  await page.goto(LOGIN_PAGE, { waitUntil: "networkidle", timeout: 15000 });

  // Fill email
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill(EMAIL);
  console.log(`  📧 Email filled: ${EMAIL}`);

  // Fill password
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(PASSWORD);
  console.log("  🔑 Password filled");

  // Click submit button
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();
  console.log("  🚀 Submit clicked, waiting for redirect...");

  // Wait for navigation away from /login
  try {
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 15000 });
    console.log(`  ✅ Login success! Redirected to: ${page.url()}`);
  } catch {
    // Might be on /onboarding or /waiting-approval
    console.log(`  ⚠️ Current URL after login: ${page.url()}`);
  }

  await sleep(2000);

  return { ctx, page, consoleErrors };
}

async function run() {
  console.log("━".repeat(60));
  console.log("  🎭 Playwright — Meta Token Status UI (Real Login)");
  console.log("━".repeat(60));
  console.log(`  Target: ${ADS_PAGE}`);
  console.log(`  Login:  ${EMAIL}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log("━".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: true });

  // ════════════════════════════════════════
  // STEP 1: Login (Desktop)
  // ════════════════════════════════════════
  console.log("\n━━━ STEP 1: Login (Desktop 1280px) ━━━\n");

  const { ctx: desktopCtx, page: desktopPage, consoleErrors: desktopErrors } = await loginAndGetContext(browser);

  // Check if we're on dashboard or onboarding
  const postLoginUrl = desktopPage.url();
  if (postLoginUrl.includes("/onboarding")) {
    log("WARN", "Login redirect", "User needs onboarding — filling onboarding form...");

    // Fill onboarding form if present
    try {
      const nameInput = desktopPage.locator('input[name="full_name"], input[placeholder*="nama" i]').first();
      if (await nameInput.count() > 0) {
        await nameInput.fill("Admin Hadona");
      }

      const divisionSelect = desktopPage.locator("select").first();
      if (await divisionSelect.count() > 0) {
        await divisionSelect.selectOption({ index: 1 });
      }

      const submitBtn = desktopPage.locator('button[type="submit"]').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await sleep(3000);
      }
    } catch (e) {
      console.log("  Onboarding fill error:", e.message);
    }
  } else if (postLoginUrl.includes("/waiting-approval")) {
    log("WARN", "Login redirect", "User waiting approval — cannot access dashboard");
  } else if (postLoginUrl.includes("/rejected")) {
    log("FAIL", "Login redirect", "User rejected");
  } else {
    log("PASS", "Login success", `Redirected to: ${postLoginUrl}`);
  }

  // ════════════════════════════════════════
  // STEP 2: Navigate to Ads Spend (Desktop)
  // ════════════════════════════════════════
  console.log("\n━━━ STEP 2: Ads Spend Page (Desktop 1280px) ━━━\n");

  try {
    await desktopPage.goto(ADS_PAGE, { waitUntil: "networkidle", timeout: 20000 });
    await sleep(3000); // Wait for client-side data fetch

    const currentUrl = desktopPage.url();

    if (currentUrl.includes("/login")) {
      log("FAIL", "Desktop ads-spend", "Redirected back to login — auth failed");
    } else {
      log("PASS", "Desktop ads-spend loaded", `URL: ${currentUrl}`);
    }

    await desktopPage.screenshot({
      path: path.join(SCREENSHOT_DIR, "desktop-ads-spend-full.png"),
      fullPage: true,
    });
    console.log("  📸 Screenshot: desktop-ads-spend-full.png");

    // Check page content for token status elements
    const bodyText = await desktopPage.textContent("body").catch(() => "");

    // Check for various Meta connection states
    const checks = [
      { label: "Connect Meta banner", keyword: "Hubungkan Meta Ads Account" },
      { label: "Meta Ads Terhubung banner", keyword: "Meta Ads Terhubung" },
      { label: "TOKEN INVALID badge", keyword: "TOKEN INVALID" },
      { label: "EXPIRING SOON badge", keyword: "EXPIRING SOON" },
      { label: "Auto-sync aktif", keyword: "Auto-sync aktif" },
      { label: "Sync Now button", keyword: "Sync Now" },
      { label: "Reconnect Meta button", keyword: "Reconnect Meta" },
      { label: "Connect Meta button", keyword: "Connect Meta" },
      { label: "Manual Token button", keyword: "Manual Token" },
      { label: "Ads Spend table", keyword: "Ad Account" },
      { label: "Total Spend text", keyword: "Total" },
    ];

    console.log("\n  📋 Content checks:");
    for (const check of checks) {
      const found = bodyText?.includes(check.keyword) || false;
      const icon = found ? "✅" : "  ";
      console.log(`    ${icon} ${check.label}: ${found ? "FOUND" : "not found"}`);
      if (found) {
        log("PASS", `Content: ${check.label}`, `"${check.keyword}" visible`);
      }
    }

    // Check for error states
    if (bodyText?.includes("Application error") || bodyText?.includes("Something went wrong")) {
      log("FAIL", "Page error", "Application error detected on page");
    }

  } catch (e) {
    log("FAIL", "Desktop ads-spend navigation", e.message);
  }

  // Report console errors
  if (desktopErrors.length > 0) {
    log("WARN", "Console errors", `${desktopErrors.length} errors detected`);
    desktopErrors.slice(0, 5).forEach((err) => console.log(`    ❌ ${err.substring(0, 150)}`));
  } else {
    log("PASS", "No console errors", "Desktop page loaded cleanly");
  }

  // ════════════════════════════════════════
  // STEP 3: Mobile View (375px) — reuse same session
  // ════════════════════════════════════════
  console.log("\n━━━ STEP 3: Ads Spend Page (Mobile 375px) ━━━\n");

  // Get cookies from desktop context and inject into mobile context
  const cookies = await desktopCtx.cookies();
  const localStorageData = await desktopPage.evaluate(() => {
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      items[key] = localStorage.getItem(key);
    }
    return items;
  }).catch(() => ({}));

  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });

  // Copy cookies
  await mobileCtx.addCookies(cookies);

  const mobilePage = await mobileCtx.newPage();

  // Copy localStorage
  if (Object.keys(localStorageData).length > 0) {
    await mobilePage.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
    await mobilePage.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, value);
      }
    }, localStorageData);
  }

  try {
    await mobilePage.goto(ADS_PAGE, { waitUntil: "networkidle", timeout: 20000 });
    await sleep(3000);

    const mobileUrl = mobilePage.url();
    if (!mobileUrl.includes("/login")) {
      log("PASS", "Mobile ads-spend loaded", `URL: ${mobileUrl}`);
    } else {
      log("WARN", "Mobile ads-spend", "Redirected to login on mobile");
    }

    await mobilePage.screenshot({
      path: path.join(SCREENSHOT_DIR, "mobile-ads-spend-full.png"),
      fullPage: true,
    });
    console.log("  📸 Screenshot: mobile-ads-spend-full.png");

    // Mobile-specific: check if sidebar is collapsed, check responsive layout
    const mobileBodyText = await mobilePage.textContent("body").catch(() => "");

    const mobileChecks = [
      { label: "Page title visible", keyword: "Ads" },
      { label: "Meta banner visible", keyword: "Meta" },
    ];

    for (const check of mobileChecks) {
      if (mobileBodyText?.includes(check.keyword)) {
        log("PASS", `Mobile: ${check.label}`, "Visible on mobile");
      }
    }

  } catch (e) {
    log("FAIL", "Mobile ads-spend navigation", e.message);
  }

  await desktopCtx.close();
  await mobileCtx.close();

  // ─── Summary ───
  console.log("\n" + "━".repeat(60));
  console.log("  📊 SUMMARY");
  console.log("━".repeat(60));
  console.log(`  ✅ Passed:   ${results.passed.length}`);
  console.log(`  ❌ Failed:   ${results.failed.length}`);
  console.log(`  ⚠️ Warnings: ${results.warnings.length}`);

  if (results.failed.length > 0) {
    console.log("\n  ❌ FAILED:");
    results.failed.forEach((f) => console.log(`    • ${f.test}: ${f.detail}`));
  }

  if (results.warnings.length > 0) {
    console.log("\n  ⚠️ WARNINGS:");
    results.warnings.forEach((w) => console.log(`    • ${w.test}: ${w.detail}`));
  }

  console.log(`\n  📸 Screenshots: ${SCREENSHOT_DIR}/`);
  console.log("━".repeat(60) + "\n");

  await browser.close();

  // Write results JSON
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, "results.json"),
    JSON.stringify(results, null, 2)
  );

  process.exit(results.failed.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});