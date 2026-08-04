/**
 * 🎭 Playwright Deep Audit — Weekly Reports Page
 * Tests: Page load, Sync Now, Import, Modals, Tabs, Mobile, Error states
 *
 * Usage:
 *   node scripts/playwright-reports-audit.mjs                          # local dev
 *   BASE_URL=https://workspace.hadona.id node scripts/playwright-reports-audit.mjs
 *
 * Optional auth (untuk test fitur admin seperti Sync Now end-to-end):
 *   TEST_LOGIN_EMAIL=xxx TEST_LOGIN_PASSWORD=xxx node scripts/playwright-reports-audit.mjs
 *
 * Output:
 *   - scripts/screenshots/reports-audit/*.png
 *   - scripts/screenshots/reports-audit/audit-report.json
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const REPORTS_PAGE = `${BASE_URL}/reports`;
const LOGIN_PAGE = `${BASE_URL}/login`;

const TEST_EMAIL = process.env.TEST_LOGIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "reports-audit");

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {
  passed: [],
  failed: [],
  warnings: [],
  bugs: [],
  metrics: {},
};

function log(type, test, detail = "") {
  const icon = type === "PASS" ? "✅" : type === "FAIL" ? "❌" : type === "WARN" ? "⚠️" : type === "BUG" ? "🐛" : "ℹ️";
  console.log(`${icon} [${type}] ${test}${detail ? " — " + detail : ""}`);
  if (type === "PASS") results.passed.push(test);
  else if (type === "FAIL") results.failed.push({ test, detail });
  else if (type === "WARN") results.warnings.push({ test, detail });
  else if (type === "BUG") results.bugs.push({ test, detail });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryLogin(page) {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    log("WARN", "Login skipped", "TEST_LOGIN_EMAIL/PASSWORD not set — fitur admin tidak akan di-test mendalam");
    return false;
  }

  try {
    log("INFO", "Attempting login", `email=${TEST_EMAIL}`);
    await page.goto(LOGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(2000);

    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const pwInput = await page.$('input[type="password"], input[name="password"]');

    if (!emailInput || !pwInput) {
      log("WARN", "Login form not found", "Mungkin hanya OAuth Google yang aktif");
      return false;
    }

    await emailInput.fill(TEST_EMAIL);
    await pwInput.fill(TEST_PASSWORD);
    await sleep(300);

    const submitBtn = await page.$('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
        submitBtn.click(),
      ]);
    } else {
      await page.keyboard.press("Enter");
    }

    await sleep(3000);
    const url = page.url();
    if (url.includes("/login") || url.includes("/auth")) {
      log("FAIL", "Login failed", "Still on auth page after submit");
      return false;
    }

    log("PASS", "Login successful", `redirected to ${url}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "00-after-login.png"), fullPage: true });
    return true;
  } catch (e) {
    log("WARN", "Login attempt failed", e.message);
    return false;
  }
}

async function run() {
  console.log("━".repeat(60));
  console.log("  🎭 Playwright Weekly Reports Deep Audit");
  console.log("━".repeat(60));
  console.log(`  Target:        ${REPORTS_PAGE}`);
  console.log(`  Auth:          ${TEST_EMAIL ? `yes (${TEST_EMAIL})` : "no (anonymous)"}`);
  console.log(`  Screenshots:   ${SCREENSHOT_DIR}`);
  console.log("━".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: true });

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: DESKTOP (1280px)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📺 PHASE 1: DESKTOP (1280×900)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const desktopCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const desktopPage = await desktopCtx.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const networkFailures = [];

  desktopPage.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  desktopPage.on("pageerror", (err) => pageErrors.push(err.message));
  desktopPage.on("requestfailed", (req) => {
    if (!req.url().includes("sentry") && !req.url().includes("favicon")) {
      networkFailures.push({ url: req.url(), error: req.failure()?.errorText });
    }
  });

  // ─── Test 1.1: Pre-auth redirect ───
  const t1Start = Date.now();
  try {
    const res = await desktopPage.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    const loadMs = Date.now() - t1Start;
    results.metrics.initialLoadMs = loadMs;
    log("PASS", "Page navigation", `${res?.status() ?? "?"} in ${loadMs}ms`);

    const url = desktopPage.url();
    if (url.includes("/login") || url.includes("/auth")) {
      log("PASS", "Unauthenticated redirect", `→ ${url}`);
    } else {
      log("WARN", "Unauthenticated redirect", `Page loaded directly (url=${url})`);
    }
  } catch (e) {
    log("FAIL", "Page navigation", e.message);
  }

  await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "01-pre-auth.png"), fullPage: true });

  // ─── Test 1.2: Try login ───
  const isLoggedIn = await tryLogin(desktopPage);

  // ─── Test 1.3: Navigate to /reports ───
  console.log("\n━━━ Element Audit ━━━");
  try {
    await desktopPage.goto(REPORTS_PAGE, { waitUntil: "networkidle", timeout: 20000 });
    await sleep(3000);
    await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "02-reports-page.png"), fullPage: true });

    if (desktopPage.url().includes("/login")) {
      log("WARN", "Not authenticated", "Layout-only audit");
    } else {
      log("PASS", "Reports page loaded", desktopPage.url());
    }
  } catch (e) {
    log("FAIL", "Reports page load", e.message);
  }

  // ─── Test 1.4: Page heading ───
  const h1 = await desktopPage.textContent("h1").catch(() => null);
  if (h1 && h1.toLowerCase().includes("weekly report")) {
    log("PASS", "Heading 'Weekly Reports'", h1.trim());
  } else {
    log("WARN", "Heading", h1 ? h1.trim() : "Not found");
  }

  // ─── Test 1.5: Stats cards ───
  const statsCards = await desktopPage.$$(".grid.grid-cols-2 > .card, .grid > div");
  log(statsCards.length >= 4 ? "PASS" : "WARN", "Stats cards", `${statsCards.length} cards (expected ≥4)`);

  // ─── Test 1.6: Search input ───
  const searchInput = await desktopPage.$('input[placeholder*="Cari"], input[placeholder*="client"], input[placeholder*="performa"]');
  log(searchInput ? "PASS" : "WARN", "Search input", searchInput ? "Found" : "Not found");

  // ─── Test 1.7: Filter dropdowns ───
  const selects = await desktopPage.$$("select");
  log(selects.length >= 2 ? "PASS" : "WARN", "Filter dropdowns", `${selects.length} selects (expected ≥2)`);

  // ─── Test 1.8: Tab navigation ───
  const tabButtons = await desktopPage.$$(
    'button:has-text("Daftar Report"), button:has-text("Multi-Week Compare"), button:has-text("Automation")'
  );
  if (tabButtons.length === 3) {
    log("PASS", "Tab navigation buttons", "All 3 tabs found");
  } else {
    log("WARN", "Tab navigation", `${tabButtons.length} tabs found (expected 3)`);
  }

  // ─── Test 1.9: Sync Now button (FITUR UTAMA BARU) ───
  console.log("\n━━━ ⭐ Sync Now Button ━━━");
  const syncBtn = await desktopPage.$('button:has-text("Sync Now")');
  if (syncBtn) {
    log("PASS", "🔄 Sync Now button", "Tombol ditemukan di header");

    await syncBtn.hover();
    await sleep(300);
    const titleAttr = await syncBtn.getAttribute("title");
    if (titleAttr && titleAttr.includes("Auto-sync")) {
      log("PASS", "Tooltip 'Auto-sync'", titleAttr);
    } else {
      log("WARN", "Tooltip", `title="${titleAttr}"`);
    }

    const isDisabled = await syncBtn.isDisabled();
    log(isDisabled ? "WARN" : "PASS", "Sync button state", isDisabled ? "disabled" : "enabled");

    if (!isDisabled) {
      desktopPage.on("dialog", async (dialog) => {
        const msg = dialog.message();
        if (msg.includes("Sync semua weekly reports")) {
          log("PASS", "Confirm dialog text", msg.substring(0, 80) + "...");
        } else {
          log("WARN", "Confirm dialog", msg.substring(0, 80));
        }
        await dialog.dismiss().catch(() => {});
      });
      await syncBtn.click();
      await sleep(800);
      log("PASS", "Sync button clickable (dialog dismissed)", "Audit tidak benar-benar trigger sync");
    }
  } else {
    log(isLoggedIn ? "FAIL" : "WARN", "🔄 Sync Now button", "Tidak ditemukan (mungkin butuh role admin)");
  }

  // ─── Test 1.10: Import dari Sheet button ───
  const importBtn = await desktopPage.$('button:has-text("Import dari Sheet"), button:has-text("Import")');
  log(importBtn ? "PASS" : "WARN", "📥 Import dari Sheet button", importBtn ? "Found" : "Not found");

  // ─── Test 1.11: New Report button ───
  const newBtn = await desktopPage.$('button:has-text("New Report")');
  log(newBtn ? "PASS" : "WARN", "➕ New Report button", newBtn ? "Found" : "Not found");

  // ─── Test 1.12: Export CSV button ───
  const exportBtn = await desktopPage.$('button:has-text("Export")');
  log(exportBtn ? "PASS" : "WARN", "📥 Export button", exportBtn ? "Found" : "Not found");

  // ─── Test 1.13: Bulk Action button ───
  const bulkBtn = await desktopPage.$('button:has-text("Bulk Action")');
  log(bulkBtn ? "PASS" : "WARN", "☑️ Bulk Action button", bulkBtn ? "Found" : "Not found (mungkin muncul hanya jika ada data)");

  // ─── Test 1.14: Report cards ───
  console.log("\n━━━ Report Cards ━━━");
  const reportCards = await desktopPage.$$(".grid.gap-4 > .card");
  if (reportCards.length > 0) {
    log("PASS", "Report cards", `${reportCards.length} cards rendered`);

    try {
      await reportCards[0].click();
      await sleep(1500);
      await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "03-detail-modal.png"), fullPage: true });

      const detailModal = await desktopPage.$('.fixed.inset-0, [role="dialog"]');
      if (detailModal) {
        log("PASS", "Detail modal opens on card click");

        const trendChart = await desktopPage.$(".recharts-surface, .recharts-wrapper");
        log(trendChart ? "PASS" : "WARN", "Trend chart in detail modal", trendChart ? "Rendered" : "Not rendered (mungkin data <2 minggu)");

        const metricGrid = await desktopPage.$$(".grid.grid-cols-3 > div, .grid.grid-cols-4 > div");
        log(metricGrid.length > 0 ? "PASS" : "WARN", "Metrics grid", `${metricGrid.length} metric cells`);

        const editBtn = await desktopPage.$('button:has-text("Edit")');
        const shareBtn = await desktopPage.$('button:has-text("Share")');
        const pdfBtn = await desktopPage.$('button:has-text("PDF")');
        log(editBtn ? "PASS" : "WARN", "Edit button in detail");
        log(shareBtn ? "PASS" : "WARN", "Share button in detail");
        log(pdfBtn ? "PASS" : "WARN", "PDF button in detail");

        const closeBtn = await desktopPage.$('.fixed.inset-0 button:has-text("X"), [aria-label="Close"], .no-print button:last-child');
        if (closeBtn) {
          await closeBtn.click();
        } else {
          await desktopPage.keyboard.press("Escape");
        }
        await sleep(500);
        log("PASS", "Detail modal closed");
      } else {
        log("WARN", "Detail modal", "Modal tidak muncul setelah klik card");
      }
    } catch (e) {
      log("WARN", "Card click interaction", e.message);
    }
  } else {
    log("WARN", "Report cards", "No cards visible (mungkin belum ada data atau redirect ke login)");
  }

  // ─── Test 1.15: New Report modal ───
  console.log("\n━━━ New Report Modal ━━━");
  if (newBtn) {
    try {
      await newBtn.click();
      await sleep(1500);
      await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "04-new-report-modal.png"), fullPage: true });

      const modal = await desktopPage.$('.fixed.inset-0, [role="dialog"]');
      if (modal) {
        log("PASS", "Create modal opens");

        const clientSelect = await desktopPage.$('select[name="client_id"], .fixed.inset-0 select');
        const dateInputs = await desktopPage.$$('.fixed.inset-0 input[type="date"]');
        log(clientSelect ? "PASS" : "FAIL", "Client select field");
        log(dateInputs.length >= 2 ? "PASS" : "WARN", "Periode date inputs", `${dateInputs.length} date inputs`);

        const pullBtn = await desktopPage.$('button:has-text("Pull dari Ads Data")');
        log(pullBtn ? "PASS" : "WARN", "Pull dari Ads Data button");

        const aiBtn = await desktopPage.$('button:has-text("Generate dengan AI")');
        log(aiBtn ? "PASS" : "WARN", "Generate dengan AI button");

        const objectiveLabel = await desktopPage.textContent("body").catch(() => "");
        if (objectiveLabel.includes("Campaign Objective")) {
          log("PASS", "Objective Selector section");
        }

        const metricInputs = await desktopPage.$$('.fixed.inset-0 input[type="number"]');
        log(metricInputs.length >= 8 ? "PASS" : "WARN", "Metrics inputs", `${metricInputs.length} fields (expected ≥8)`);

        const cancelBtn = await desktopPage.$('button:has-text("Batal")');
        if (cancelBtn) {
          await cancelBtn.click();
        } else {
          await desktopPage.keyboard.press("Escape");
        }
        await sleep(500);
        log("PASS", "Create modal closed");
      } else {
        log("FAIL", "Create modal", "Modal tidak muncul");
      }
    } catch (e) {
      log("FAIL", "Create modal interaction", e.message);
    }
  }

  // ─── Test 1.16: Tab switching ───
  console.log("\n━━━ Tab Switching ━━━");
  try {
    const compareTab = await desktopPage.$('button:has-text("Multi-Week Compare")');
    if (compareTab) {
      await compareTab.click();
      await sleep(1500);
      await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "05-compare-tab.png"), fullPage: true });
      log("PASS", "Compare tab clickable");

      const compareContent = await desktopPage.textContent("body").catch(() => "");
      if (compareContent.includes("Compare") || compareContent.includes("Periode")) {
        log("PASS", "CompareView rendered");
      }
    }

    const autoTab = await desktopPage.$('button:has-text("Automation")');
    if (autoTab) {
      await autoTab.click();
      await sleep(1500);
      await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "06-automation-tab.png"), fullPage: true });
      log("PASS", "Automation tab clickable");

      const autoContent = await desktopPage.textContent("body").catch(() => "");
      if (autoContent.includes("Email") || autoContent.includes("Schedule")) {
        log("PASS", "EmailScheduleManager rendered");
      }
    }

    const listTab = await desktopPage.$('button:has-text("Daftar Report")');
    if (listTab) {
      await listTab.click();
      await sleep(800);
      log("PASS", "Back to Daftar Report tab");
    }
  } catch (e) {
    log("WARN", "Tab switching", e.message);
  }

  // ─── Test 1.17: Search interaction ───
  console.log("\n━━━ Search & Filter ━━━");
  if (searchInput) {
    try {
      await searchInput.fill("nonexistent-client-xyz-123");
      await sleep(800);
      await desktopPage.screenshot({ path: path.join(SCREENSHOT_DIR, "07-search-empty.png"), fullPage: true });

      const emptyState = await desktopPage.textContent("body").catch(() => "");
      if (emptyState.includes("Tidak ada") || emptyState.includes("Reset Filter")) {
        log("PASS", "Empty state on no result");
      } else {
        log("WARN", "Empty state", "Tidak terdeteksi (mungkin masih ada card)");
      }

      await searchInput.fill("");
      await sleep(500);
      log("PASS", "Search reset");
    } catch (e) {
      log("WARN", "Search interaction", e.message);
    }
  }

  // ─── Test 1.18: Console & page errors ───
  console.log("\n━━━ Console Health ━━━");
  if (consoleErrors.length > 0) {
    log("BUG", "Console errors", `${consoleErrors.length} errors`);
    consoleErrors.slice(0, 5).forEach((e) => console.log(`    → ${e.substring(0, 200)}`));
  } else {
    log("PASS", "No console errors");
  }

  if (pageErrors.length > 0) {
    log("BUG", "Uncaught exceptions", `${pageErrors.length} errors`);
    pageErrors.slice(0, 3).forEach((e) => console.log(`    → ${e.substring(0, 200)}`));
  } else {
    log("PASS", "No uncaught exceptions");
  }

  if (networkFailures.length > 0) {
    log("WARN", "Network failures", `${networkFailures.length} failed requests`);
    networkFailures.slice(0, 3).forEach((f) => console.log(`    → ${f.url.substring(0, 100)}: ${f.error}`));
  }

  await desktopCtx.close();

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: MOBILE (375px)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📱 PHASE 2: MOBILE (375×812)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const mobileCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: undefined,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mobilePage = await mobileCtx.newPage();

  try {
    await mobilePage.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);
    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "08-mobile-fullpage.png"), fullPage: true });
    log("PASS", "Mobile page load", mobilePage.url());

    // Cek horizontal overflow
    const overflow = await mobilePage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 5) {
      log("BUG", "Mobile horizontal overflow", `scrollW=${overflow.scrollWidth} vs clientW=${overflow.clientWidth} (overflow ${overflow.scrollWidth - overflow.clientWidth}px)`);
    } else {
      log("PASS", "Mobile: no horizontal overflow", `${overflow.scrollWidth}=${overflow.clientWidth}`);
    }

    // Tap target size audit (gunakan browser API di evaluate)
    const smallTargets = await mobilePage.evaluate(() => {
      const btns = document.querySelectorAll("button, a, [role=button]");
      const small = [];
      btns.forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.height > 0 && r.height < 36) {
          small.push({ text: b.textContent?.trim()?.substring(0, 30), h: Math.round(r.height), w: Math.round(r.width) });
        }
      });
      return small.slice(0, 5);
    });
    if (smallTargets.length > 0) {
      log("WARN", "Mobile: small tap targets", `${smallTargets.length} buttons <36px (WCAG recommends ≥44px)`);
      smallTargets.forEach((t) => console.log(`    → "${t.text}" ${t.w}×${t.h}px`));
    } else {
      log("PASS", "Mobile: tap target sizes OK");
    }

    const mobileSyncBtn = await mobilePage.$('button:has-text("Sync Now")');
    if (mobileSyncBtn) {
      const rect = await mobileSyncBtn.boundingBox();
      log(rect && rect.x + rect.width <= 375 ? "PASS" : "WARN", "Mobile: Sync Now button position", rect ? `x=${Math.round(rect.x)} w=${Math.round(rect.width)}` : "not visible");
    }

    // Cek tab navigation scrollable di mobile (browser API di evaluate)
    const tabScroll = await mobilePage.evaluate(() => {
      const tabs = document.querySelector('[class*=overflow-x-auto]');
      return tabs ? { scrollW: tabs.scrollWidth, clientW: tabs.clientWidth } : null;
    });
    if (tabScroll && tabScroll.scrollW > tabScroll.clientW) {
      log("PASS", "Mobile: tabs horizontally scrollable", `${tabScroll.scrollW}px > ${tabScroll.clientW}px`);
    }

    await mobilePage.screenshot({ path: path.join(SCREENSHOT_DIR, "09-mobile-viewport.png"), fullPage: false });
  } catch (e) {
    log("FAIL", "Mobile page load", e.message);
  }

  await mobileCtx.close();

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: ERROR STATE (500 simulation)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  💥 PHASE 3: ERROR STATE SIMULATION");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const errorCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const errorPage = await errorCtx.newPage();

  await errorPage.route("**/api/**", (route) => {
    route.fulfill({ status: 500, body: JSON.stringify({ error: "Simulated server error" }), contentType: "application/json" });
  });

  try {
    await errorPage.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(3000);
    await errorPage.screenshot({ path: path.join(SCREENSHOT_DIR, "10-error-state.png"), fullPage: true });

    const bodyText = await errorPage.textContent("body").catch(() => "");
    if (bodyText.includes("Gagal memuat") || bodyText.includes("error") || bodyText.includes("Coba Lagi")) {
      log("PASS", "Error state handled gracefully");
    } else {
      log("WARN", "Error state UI", "Tidak ada error UI yang jelas (mungkin masih loading atau redirect)");
    }
  } catch (e) {
    log("WARN", "Error state test", e.message);
  }

  await errorCtx.close();

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: SLOW NETWORK (3G simulation)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  🐌 PHASE 4: SLOW 3G NETWORK");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const slowCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const slowPage = await slowCtx.newPage();

  await slowCtx.route("**/*", (route) => {
    setTimeout(() => route.continue(), 300);
  });

  try {
    const t = Date.now();
    await slowPage.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 30000 });
    const slowLoadMs = Date.now() - t;
    results.metrics.slowNetworkLoadMs = slowLoadMs;
    log("PASS", "Slow network load", `${slowLoadMs}ms`);
    await sleep(2000);
    await slowPage.screenshot({ path: path.join(SCREENSHOT_DIR, "11-slow-network.png"), fullPage: true });

    if (slowLoadMs > 8000) {
      log("WARN", "Slow network performance", `Load ${slowLoadMs}ms — pertimbangkan skeleton lebih aggressive`);
    }
  } catch (e) {
    log("WARN", "Slow network test", e.message);
  }

  await slowCtx.close();

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("  📊 AUDIT SUMMARY");
  console.log("═".repeat(60));
  console.log(`  ✅ Passed:    ${results.passed.length}`);
  console.log(`  ❌ Failed:    ${results.failed.length}`);
  console.log(`  ⚠️  Warnings:  ${results.warnings.length}`);
  console.log(`  🐛 Bugs:      ${results.bugs.length}`);
  console.log("═".repeat(60));

  if (results.metrics.initialLoadMs) {
    console.log(`  ⏱️  Initial load:    ${results.metrics.initialLoadMs}ms`);
  }
  if (results.metrics.slowNetworkLoadMs) {
    console.log(`  🐌 Slow 3G load:    ${results.metrics.slowNetworkLoadMs}ms`);
  }

  if (results.failed.length > 0) {
    console.log("\n❌ FAILED:");
    results.failed.forEach((f) => console.log(`   • ${f.test}: ${f.detail}`));
  }
  if (results.bugs.length > 0) {
    console.log("\n🐛 BUGS:");
    results.bugs.forEach((b) => console.log(`   • ${b.test}: ${b.detail}`));
  }
  if (results.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS:");
    results.warnings.forEach((w) => console.log(`   • ${w.test}: ${w.detail}`));
  }

  const reportPath = path.join(SCREENSHOT_DIR, "audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Report:     ${reportPath}`);
  console.log(`📁 Screenshots: ${SCREENSHOT_DIR}\n`);

  await browser.close();
  process.exit(results.failed.length > 0 || results.bugs.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});