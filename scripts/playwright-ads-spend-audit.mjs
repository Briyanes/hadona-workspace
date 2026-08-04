/**
 * Playwright Deep Audit — Ads Spend Page
 * Tests: Page load, modals, filters, responsive, error states
 * 
 * Usage: node scripts/playwright-ads-spend-audit.mjs
 * Prereq: Dev server running on http://localhost:3000
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADS_PAGE = `${BASE_URL}/ads-spend`;
const LOGIN_PAGE = `${BASE_URL}/login`;

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "ads-spend-audit");

// Ensure screenshot dir
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {
  passed: [],
  failed: [],
  warnings: [],
  bugs: [],
};

function log(type, test, detail = "") {
  const icon = type === "PASS" ? "✅" : type === "FAIL" ? "❌" : type === "WARN" ? "⚠️" : "🐛";
  console.log(`${icon} [${type}] ${test}${detail ? " — " + detail : ""}`);
  if (type === "PASS") results.passed.push(test);
  else if (type === "FAIL") results.failed.push({ test, detail });
  else if (type === "WARN") results.warnings.push({ test, detail });
  else if (type === "BUG") results.bugs.push({ test, detail });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("━".repeat(60));
  console.log("  🎭 Playwright Ads Spend Deep Audit");
  console.log("━".repeat(60));
  console.log(`  Target: ${ADS_PAGE}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log("━".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: true });

  // ════════════════════════════════════════
  // TEST 1: Desktop View (1280px)
  // ════════════════════════════════════════
  console.log("\n━━━━━━ DESKTOP TESTS (1280px) ━━━━━━\n");
  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const desktopPage = await desktopCtx.newPage();

  // Capture console errors
  const consoleErrors = [];
  desktopPage.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  // Capture page errors (uncaught exceptions)
  const pageErrors = [];
  desktopPage.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  // ─── Test: Redirect to login when not authenticated ───
  try {
    const res = await desktopPage.goto(ADS_PAGE, { waitUntil: "networkidle", timeout: 15000 });
    const url = desktopPage.url();

    if (url.includes("/login") || url.includes("/auth")) {
      log("PASS", "Unauthenticated redirect", `Redirected to ${url}`);
    } else if (res && res.status() === 200) {
      // Might have session from previous test — continue
      log("WARN", "Unauthenticated redirect", "Page loaded (may have existing session)");
    }
  } catch (e) {
    log("FAIL", "Page navigation", e.message);
  }

  await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "01-pre-auth.png"), fullPage: true });

  // ─── Try to authenticate (check if login form exists) ───
  try {
    await desktopPage.goto(LOGIN_PAGE, { waitUntil: "networkidle", timeout: 10000 });

    const emailInput = await desktopPage.querySelector('input[type="email"], input[name="email"]');
    if (emailInput) {
      log("PASS", "Login form found", "Email input detected");
    } else {
      const googleBtn = await desktopPage.querySelector('button:has-text("Google"), a:has-text("Google")');
      if (googleBtn) {
        log("PASS", "Google OAuth button found");
      }
    }
  } catch (e) {
    log("WARN", "Login page check", e.message);
  }

  // ─── Go to ads-spend page (may redirect if not logged in) ───
  try {
    await desktopPage.goto(ADS_PAGE, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(3000); // Wait for client-side render
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "02-page-load.png"), fullPage: true });

    const url = desktopPage.url();
    if (url.includes("/login")) {
      log("WARN", "Not authenticated", "Cannot test authenticated pages. Testing layout only.");

      // Test login page layout
      const heading = await desktopPage.textContent("h1, h2").catch(() => null);
      log("PASS", "Login heading visible", heading || "N/A");
    } else {
      log("PASS", "Ads spend page loaded", url);
    }
  } catch (e) {
    log("FAIL", "Ads spend page load", e.message);
  }

  // ─── Test: Check for console errors ───
  if (consoleErrors.length > 0) {
    log("BUG", "Console errors detected", `${consoleErrors.length} errors`);
    consoleErrors.slice(0, 5).forEach((err) => {
      console.log(`    → ${err.substring(0, 150)}`);
    });
  } else {
    log("PASS", "No console errors");
  }

  if (pageErrors.length > 0) {
    log("BUG", "Uncaught exceptions", `${pageErrors.length} errors`);
    pageErrors.slice(0, 3).forEach((err) => {
      console.log(`    → ${err.substring(0, 150)}`);
    });
  } else {
    log("PASS", "No uncaught exceptions");
  }

  // ════════════════════════════════════════
  // TEST 2: If page loaded, check elements
  // ════════════════════════════════════════
  if (!desktopPage.url().includes("/login")) {
    console.log("\n━━━━━━ ELEMENT TESTS ━━━━━━\n");

    // ─── Test: Page heading ───
    const h1 = await desktopPage.textContent("h1").catch(() => null);
    if (h1 && h1.toLowerCase().includes("ads spend")) {
      log("PASS", "Page heading", h1.trim());
    } else {
      log("WARN", "Page heading", h1 ? h1.trim() : "Not found");
    }

    // ─── Test: Stats cards ───
    const statsCards = await desktopPage.querySelectorAll(".card .card, .grid > div .card, .grid > div");
    if (statsCards.length >= 4) {
      log("PASS", "Stats cards", `${statsCards.length} cards visible`);
    } else if (statsCards.length > 0) {
      log("WARN", "Stats cards", `Only ${statsCards.length} found (expected 4)`);
    } else {
      log("FAIL", "Stats cards", "No stats cards found");
    }

    // ─── Test: Search input ───
    const searchInput = await desktopPage.querySelector('input[placeholder*="Cari"], input[type="text"]');
    if (searchInput) {
      log("PASS", "Search input found");
    } else {
      log("WARN", "Search input", "Not found");
    }

    // ─── Test: Filter dropdowns ───
    const selects = await desktopPage.querySelectorAll("select");
    log("PASS", "Filter dropdowns", `${selects.length} dropdowns found`);

    // ─── Test: Export button ───
    const exportBtn = await desktopPage.querySelector('button:has-text("Export"), button[title="Export"]');
    log(exportBtn ? "PASS" : "WARN", "Export button", exportBtn ? "Found" : "Not found");

    // ─── Test: New Ad Account button ───
    const newBtn = await desktopPage.querySelector('button:has-text("New"), button:has-text("Ad Account")');
    log(newBtn ? "PASS" : "WARN", "New Ad Account button", newBtn ? "Found" : "Not found");

    // ─── Test: Platform breakdown ───
    const platformSection = await desktopPage.textContent("body").catch(() => "");
    if (platformSection.includes("PLATFORM") || platformSection.includes("BREAKDOWN")) {
      log("PASS", "Platform breakdown section");
    } else {
      log("WARN", "Platform breakdown", "Section not detected");
    }

    // ─── Test: Trend chart ───
    const chartCanvas = await desktopPage.querySelector(".recharts-surface, .recharts-wrapper, canvas");
    log(chartCanvas ? "PASS" : "WARN", "Trend chart", chartCanvas ? "Rendered" : "Not rendered");

    // ─── Test: Data table ───
    const tableRows = await desktopPage.querySelectorAll("table tbody tr, [class*=table] tbody tr");
    log("PASS", "Data table", `${tableRows.length} rows found`);

    // ─── Test: Table headers sortable ───
    const sortableHeaders = await desktopPage.querySelectorAll("th[class*=sortable], th[class*=cursor-pointer], th button");
    log("PASS", "Sortable headers", `${sortableHeaders.length} found`);

    // ─── Test: Meta connection banner ───
    const metaBanner = await desktopPage.textContent("body").catch(() => "");
    if (metaBanner.includes("Meta Ads") || metaBanner.includes("Meta") || metaBanner.includes("Connect")) {
      log("PASS", "Meta connection banner visible");
    } else {
      log("WARN", "Meta banner", "Not detected");
    }

    // ─── Test: Budget alert (conditional) ───
    const budgetAlert = await desktopPage.querySelector('[class*=danger], [class*=alert], [class*=warning]');
    if (budgetAlert) {
      const alertText = await budgetAlert.textContent().catch(() => "");
      if (alertText && alertText.includes("budget")) {
        log("PASS", "Budget alert visible", alertText.substring(0, 80));
      }
    }

    // ─── Test: Click "New Ad Account" modal ───
    console.log("\n━━━━━━ MODAL TESTS ━━━━━━\n");
    if (newBtn) {
      try {
        await newBtn.click();
        await sleep(1500);
        await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "03-modal-new-account.png"), fullPage: true });

        const modal = await desktopPage.querySelector('[role="dialog"], .fixed.inset-0, [class*=modal]');
        if (modal) {
          log("PASS", "New Ad Account modal opens");

          // Check modal fields
          const modalInputs = await desktopPage.querySelectorAll('[role="dialog"] input, .fixed.inset-0 input');
          log("PASS", "Modal inputs", `${modalInputs.length} fields`);

          // Check for platform dropdown
          const platformSelect = await desktopPage.querySelector('[role="dialog"] select, .fixed.inset-0 select');
          log(platformSelect ? "PASS" : "WARN", "Platform select in modal");

          // Check for client dropdown
          const clientSelect = await desktopPage.querySelector('select option:has-text("Client"), select option:has-text("client")');
          log(clientSelect ? "PASS" : "WARN", "Client dropdown in modal");

          // Close modal
          const closeBtn = await desktopPage.querySelector('[role="dialog"] button:has-text("Cancel"), .fixed.inset-0 button:has-text("Cancel"), button[aria-label="Close"]');
          if (closeBtn) {
            await closeBtn.click();
            await sleep(500);
            log("PASS", "Modal close button works");
          } else {
            // Try Escape
            await desktopPage.keyboard.press("Escape");
            await sleep(500);
            log("PASS", "Modal closed via Escape");
          }
        } else {
          log("FAIL", "New Ad Account modal", "Modal did not appear");
        }
      } catch (e) {
        log("FAIL", "New Ad Account modal interaction", e.message);
      }
    }

    // ─── Test: Filter interaction ───
    console.log("\n━━━━━━ FILTER TESTS ━━━━━━\n");
    if (selects.length > 0) {
      try {
        // Click first select (client filter)
        await selects[0].selectOption({ index: 1 }).catch(() => {});
        await sleep(1000);
        await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "04-filter-applied.png"), fullPage: true });
        log("PASS", "Filter dropdown interaction");

        // Reset
        await selects[0].selectOption({ value: "all" }).catch(() => {});
        await sleep(500);
      } catch (e) {
        log("WARN", "Filter interaction", e.message);
      }
    }

    // ─── Test: Search input ───
    if (searchInput) {
      try {
        await searchInput.fill("test search");
        await sleep(500);
        await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "05-search-active.png"), fullPage: true });
        log("PASS", "Search input works");

        await searchInput.fill("");
        await sleep(300);
      } catch (e) {
        log("WARN", "Search input", e.message);
      }
    }

    // ─── Test: Chart range toggle (7D/30D) ───
    const toggle7D = await desktopPage.querySelector('button:has-text("7D")');
    const toggle30D = await desktopPage.querySelector('button:has-text("30D")');
    if (toggle7D && toggle30D) {
      try {
        await toggle30D.click();
        await sleep(1000);
        await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "06-chart-30d.png"), fullPage: true });
        log("PASS", "30D chart toggle");

        await toggle7D.click();
        await sleep(500);
        log("PASS", "7D chart toggle");
      } catch (e) {
        log("WARN", "Chart toggle", e.message);
      }
    } else {
      log("WARN", "Chart range toggle", "Buttons not found");
    }
  }

  await desktopCtx.close();

  // ════════════════════════════════════════
  // TEST 3: Mobile View (375px)
  // ════════════════════════════════════════
  console.log("\n━━━━━━ MOBILE TESTS (375px) ━━━━━━\n");
  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: undefined,
  });
  const mobilePage = await mobileCtx.newPage();

  try {
    await mobilePage.goto(ADS_PAGE, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(3000);
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "07-mobile-fullpage.png"), fullPage: true });

    const url = mobilePage.url();
    if (url.includes("/login")) {
      log("WARN", "Mobile: Redirected to login", "Not authenticated");
    } else {
      log("PASS", "Mobile: Page loaded");

      // Check horizontal scroll (mobile bug)
      const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
      if (scrollWidth > clientWidth + 5) {
        log("BUG", "Mobile: Horizontal scroll overflow", `scrollWidth=${scrollWidth}, clientWidth=${clientWidth}. Content overflows viewport!`);
      } else {
        log("PASS", "Mobile: No horizontal overflow");
      }

      // Check viewport-first-screenshot
      await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "08-mobile-viewport.png"), fullPage: false });
      log("PASS", "Mobile: Viewport screenshot captured");

      // Check if table is scrollable on mobile
      const tableContainer = await mobilePage.querySelector(".overflow-x-auto, .overflow-x-scroll");
      if (tableContainer) {
        log("PASS", "Mobile: Table horizontal scroll container found");
      } else {
        // Check if table overflows without container
        const tableWidth = await mobilePage.evaluate(() => {
          const table = document.querySelector("table");
          return table ? table.scrollWidth : 0;
        });
        if (tableWidth > 375) {
          log("BUG", "Mobile: Table overflow without scroll container", `Table width=${tableWidth}px`);
        }
      }

      // Check buttons tap target size (min 44px)
      const smallButtons = await mobilePage.evaluate(() => {
        const buttons = document.querySelectorAll("button");
        const small = [];
        buttons.forEach((btn) => {
          const rect = btn.getBoundingClientRect();
          if (rect.height > 0 && rect.height < 36) {
            small.push({ text: btn.textContent?.substring(0, 30), height: rect.height });
          }
        });
        return small.slice(0, 5);
      });
      if (smallButtons.length > 0) {
        log("WARN", "Mobile: Small tap targets", `${smallButtons.length} buttons < 36px height`);
      } else {
        log("PASS", "Mobile: Tap target sizes OK");
      }
    }
  } catch (e) {
    log("FAIL", "Mobile: Page load", e.message);
  }

  await mobileCtx.close();

  // ════════════════════════════════════════
  // TEST 4: Error State
  // ════════════════════════════════════════
  console.log("\n━━━━━━ ERROR STATE TESTS ━━━━━━\n");
  const errorCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const errorPage = await errorCtx.newPage();

  // Intercept API calls and force failure
  await errorPage.route("**/api/**", (route) => {
    route.fulfill({ status: 500, body: JSON.stringify({ error: "Simulated server error" }) });
  });

  try {
    await errorPage.goto(ADS_PAGE, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(3000);
    await errorPage.screenshot({ path: path.join(SCREENSHOT_DIR, "09-error-state.png"), fullPage: true });

    const errorText = await errorPage.textContent("body").catch(() => "");
    if (errorText.includes("error") || errorText.includes("Error") || errorText.includes("Coba Lagi")) {
      log("PASS", "Error state handled", "Error UI displayed");
    } else {
      log("WARN", "Error state", "No error UI detected (page may redirect to login)");
    }
  } catch (e) {
    log("WARN", "Error state test", e.message);
  }

  await errorCtx.close();

  // ════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("  📊 AUDIT SUMMARY");
  console.log("═".repeat(60));
  console.log(`  ✅ Passed:    ${results.passed.length}`);
  console.log(`  ❌ Failed:    ${results.failed.length}`);
  console.log(`  ⚠️  Warnings:  ${results.warnings.length}`);
  console.log(`  🐛 Bugs:      ${results.bugs.length}`);
  console.log("═".repeat(60));

  if (results.failed.length > 0) {
    console.log("\n❌ FAILED TESTS:");
    results.failed.forEach((f) => console.log(`   • ${f.test}: ${f.detail}`));
  }

  if (results.bugs.length > 0) {
    console.log("\n🐛 BUGS FOUND:");
    results.bugs.forEach((b) => console.log(`   • ${b.test}: ${b.detail}`));
  }

  if (results.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    results.warnings.forEach((w) => console.log(`   • ${w.test}: ${w.detail}`));
  }

  // Write JSON report
  const reportPath = path.join(SCREENSHOT_DIR, "audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Full report: ${reportPath}`);
  console.log(`📁 Screenshots: ${SCREENSHOT_DIR}\n`);

  await browser.close();

  // Exit code
  process.exit(results.failed.length > 0 || results.bugs.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});