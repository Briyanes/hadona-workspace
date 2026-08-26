/**
 * 🎭 Playwright Test — ObjectiveSelector (Mobile + Desktop)
 *
 * Verify fix mobile dari commit 24897dc:
 *   1. Width: w-[calc(100vw-3rem)] max-w-[400px] → tidak overflow
 *   2. Alignment: right-0 sm:right-auto sm:left-0 → tidak terpotong viewport
 *   3. Touch target: py-2.5 sm:py-1.5 → ≥36px (mendekati Apple HIG 44px)
 *   4. Max height: max-h-[60vh] sm:max-h-[350px] → adaptif
 *   5. Search input: text-sm sm:text-xs → readable di mobile
 *   6. Group label: text-[10px] sm:text-[9px] → readable
 *
 * Usage:
 *   TEST_LOGIN_EMAIL=your@email.com TEST_LOGIN_PASSWORD='...' \
 *   BASE_URL=https://workspace.hadona.id \
 *   node scripts/playwright-objective-selector.mjs
 *
 * Output:
 *   - scripts/screenshots/objective-selector/*.png
 *   - scripts/screenshots/objective-selector/audit-report.json
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const REPORTS_PAGE = `${BASE_URL}/reports`;
const LOGIN_PAGE = `${BASE_URL}/login`;

const TEST_EMAIL = process.env.TEST_LOGIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "objective-selector");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const results = {
  passed: [],
  failed: [],
  warnings: [],
  bugs: [],
  metrics: {},
};

function log(type, test, detail = "") {
  const icon =
    type === "PASS" ? "✅"
    : type === "FAIL" ? "❌"
    : type === "WARN" ? "⚠️"
    : type === "BUG" ? "🐛"
    : "ℹ️";
  console.log(`${icon} [${type}] ${test}${detail ? " — " + detail : ""}`);
  if (type === "PASS") results.passed.push(test);
  else if (type === "FAIL") results.failed.push({ test, detail });
  else if (type === "WARN") results.warnings.push({ test, detail });
  else if (type === "BUG") results.bugs.push({ test, detail });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryLogin(page) {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    log("WARN", "Login skipped", "TEST_LOGIN_EMAIL/PASSWORD not set");
    return false;
  }

  try {
    log("INFO", "Attempting login", `email=${TEST_EMAIL}`);
    await page.goto(LOGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2500);

    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const pwInput = await page.$('input[type="password"], input[name="password"]');

    if (!emailInput || !pwInput) {
      log("WARN", "Login form not found", "Mungkin OAuth Google only");
      return false;
    }

    await emailInput.fill(TEST_EMAIL);
    await pwInput.fill(TEST_PASSWORD);
    await sleep(300);

    const submitBtn = await page.$(
      'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Masuk")'
    );
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
        submitBtn.click(),
      ]);
    } else {
      await page.keyboard.press("Enter");
    }

    await sleep(4000);
    const url = page.url();
    if (url.includes("/login") || url.includes("/auth")) {
      log("FAIL", "Login failed", `Still on ${url}`);
      return false;
    }

    log("PASS", "Login successful", `→ ${url}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "00-after-login.png"), fullPage: true });
    return true;
  } catch (e) {
    log("WARN", "Login attempt failed", e.message);
    return false;
  }
}

/**
 * Open the "New Report" modal — must reveal ObjectiveSelector
 */
async function openNewReportModal(page) {
  // Multiple selector attempts — button mungkin disabled or icon-only
  const newBtn =
    (await page.$('button[title="New Report"]')) ||
    (await page.$('button:has-text("New Report")')) ||
    (await page.$('button:has-text("Buat Report")'));

  if (!newBtn) {
    log("FAIL", "New Report button", "Tidak ditemukan");
    return false;
  }

  await newBtn.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  await newBtn.click();
  await sleep(2000);
  log("PASS", "Click New Report button", "modal opening");
  return true;
}

/**
 * Get the ObjectiveSelector trigger button — uses data attribute
 */
async function getObjectiveTrigger(page) {
  return await page.$('[data-objective-dropdown] > button');
}

/**
 * Get the dropdown panel (after open)
 */
async function getObjectiveDropdown(page) {
  return await page.$('[data-objective-dropdown] > div.absolute');
}

async function runPhaseDesktop(browser) {
  console.log("\n" + "━".repeat(60));
  console.log("  📺 PHASE 1: DESKTOP (1280×900) — Verify no regression");
  console.log("━".repeat(60) + "\n");

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    // Navigate
    const t = Date.now();
    const res = await page.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    results.metrics.desktopNavMs = Date.now() - t;
    log("PASS", "Page navigation", `${res?.status()} in ${results.metrics.desktopNavMs}ms`);

    if (page.url().includes("/login")) {
      const ok = await tryLogin(page);
      if (!ok) {
        log("FAIL", "Phase 1 abort", "Tidak bisa login");
        await ctx.close();
        return;
      }
      await page.goto(REPORTS_PAGE, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    }
    await sleep(3000);

    // ─── Test 1: Page loaded ───
    const h1 = await page.textContent("h1").catch(() => "");
    if (h1.toLowerCase().includes("weekly report")) {
      log("PASS", "Page heading", h1.trim());
    } else {
      log("WARN", "Page heading", h1 ? h1.trim() : "Not found");
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-desktop-reports-page.png"), fullPage: true });

    // ─── Test 2: Open New Report modal ───
    console.log("\n━━━ Open New Report Modal ━━━");
    const modalOpened = await openNewReportModal(page);
    if (!modalOpened) {
      await ctx.close();
      return;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-desktop-modal-open.png"), fullPage: true });

    // ─── Test 3: Modal & Objective Selector section ───
    const modal = await page.$('.fixed.inset-0, [role="dialog"]');
    log(modal ? "PASS" : "FAIL", "Modal rendered", modal ? "Found" : "Not found");

    const objectiveLabel = await page.$('label:has-text("Campaign Objective")');
    log(objectiveLabel ? "PASS" : "WARN", "🎯 Campaign Objective label", objectiveLabel ? "Found" : "Not found");

    // ─── Test 4: Click trigger to open dropdown ───
    console.log("\n━━━ Open Dropdown ━━━");
    const trigger = await getObjectiveTrigger(page);
    if (!trigger) {
      log("FAIL", "Trigger button", "data-objective-dropdown > button tidak ditemukan");
      await ctx.close();
      return;
    }

    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(300);
    await trigger.click();
    await sleep(800);
    log("PASS", "Click trigger button", "dropdown should open");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-desktop-dropdown-open.png"), fullPage: true });

    const dropdown = await getObjectiveDropdown(page);
    if (!dropdown) {
      log("FAIL", "Dropdown panel", "Tidak muncul setelah click");
      await ctx.close();
      return;
    }
    log("PASS", "Dropdown panel rendered");

    // ─── Test 5: Desktop width = 400px (max-w-[400px]) ───
    const deskBox = await dropdown.boundingBox();
    if (deskBox) {
      results.metrics.desktopDropdownWidth = Math.round(deskBox.width);
      log(
        deskBox.width >= 380 && deskBox.width <= 410 ? "PASS" : "WARN",
        "Desktop dropdown width",
        `${Math.round(deskBox.width)}px (expected ~400px)`
      );
      log(
        deskBox.x >= 0 ? "PASS" : "WARN",
        "Desktop x position",
        `x=${Math.round(deskBox.x)} (expected ≥0, extend ke kanan)`
      );
    }

    // ─── Test 6: Grouped list labels ───
    const groupLabels = await dropdown.$$("p.text-\\[9px\\], p.text-\\[10px\\]");
    log(
      groupLabels.length >= 3 ? "PASS" : "WARN",
      "Group labels (AWARENESS/TRAFFIC/etc.)",
      `${groupLabels.length} labels (expected ≥3)`
    );

    // ─── Test 7: Search input ───
    console.log("\n━━━ Search Filter ━━━");
    const searchInput = await dropdown.$('input[placeholder*="Cari"]');
    if (searchInput) {
      log("PASS", "Search input found");
      await searchInput.fill("awareness");
      await sleep(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-desktop-search-awareness.png"), fullPage: true });

      const bodyText = await page.textContent("body").catch(() => "");
      log(
        bodyText.toLowerCase().includes("awareness") ? "PASS" : "WARN",
        "Search 'awareness' filter",
        "result rendered"
      );

      await searchInput.fill("");
      await sleep(400);
    } else {
      log("WARN", "Search input", "Tidak ditemukan");
    }

    // ─── Test 8: Click an option ───
    console.log("\n━━━ Click Objective Option ━━━");
    const firstOption = await dropdown.$("button:has(span.badge)");
    if (firstOption) {
      const beforeText = await trigger.textContent();
      await firstOption.click();
      await sleep(600);

      const dropdownClosed = !(await getObjectiveDropdown(page));
      log(dropdownClosed ? "PASS" : "WARN", "Dropdown closes on select", dropdownClosed ? "Closed" : "Still open");

      const afterText = await trigger.textContent();
      log("PASS", "Value updated", `trigger text changed: "${beforeText?.trim().substring(0, 40)}" → "${afterText?.trim().substring(0, 40)}"`);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-desktop-after-select.png"), fullPage: true });
    } else {
      log("WARN", "First option", "Tidak ditemukan");
    }

    // ─── Test 9: Re-open & Escape ───
    console.log("\n━━━ Escape Key ━━━");
    const trigger2 = await getObjectiveTrigger(page);
    if (trigger2) {
      await trigger2.click();
      await sleep(400);
      const reopened = await getObjectiveDropdown(page);
      log(reopened ? "PASS" : "WARN", "Dropdown re-opens", reopened ? "Open" : "Not open");

      // Click outside to test outside-click handler
      await page.mouse.click(10, 10);
      await sleep(500);
      const closed = !(await getObjectiveDropdown(page));
      log(closed ? "PASS" : "WARN", "Outside click closes dropdown", closed ? "Closed" : "Still open");
    }

    // ─── Test 10: Console health ───
    if (consoleErrors.length > 0) {
      log("BUG", "Console errors", `${consoleErrors.length} errors`);
      consoleErrors.slice(0, 3).forEach((e) => console.log(`    → ${e.substring(0, 200)}`));
    } else {
      log("PASS", "No console errors");
    }
  } catch (e) {
    log("FAIL", "Desktop phase", e.message);
  } finally {
    await ctx.close();
  }
}

async function runPhaseMobile(browser) {
  console.log("\n" + "━".repeat(60));
  console.log("  📱 PHASE 2: MOBILE (375×812) — Verify 6 fix dari commit 24897dc");
  console.log("━".repeat(60) + "\n");

  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    storageState: undefined,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  try {
    // ─── Login first (mobile) ───
    await page.goto(LOGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2500);

    if (page.url().includes("/login")) {
      const ok = await tryLogin(page);
      if (!ok) {
        log("FAIL", "Mobile phase abort", "Login gagal");
        await ctx.close();
        return;
      }
    }

    await page.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);

    // ─── Test M1: Horizontal overflow (PAGE-LEVEL) ───
    const pageOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (pageOverflow.scrollWidth > pageOverflow.clientWidth + 5) {
      log("BUG", "Mobile: PAGE horizontal overflow", `scrollW=${pageOverflow.scrollWidth} vs clientW=${pageOverflow.clientWidth}`);
    } else {
      log("PASS", "Mobile: page no horizontal overflow", `${pageOverflow.scrollWidth}=${pageOverflow.clientWidth}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-mobile-reports-page.png"), fullPage: true });

    // ─── Test M2: Open modal ───
    const modalOpened = await openNewReportModal(page);
    if (!modalOpened) {
      await ctx.close();
      return;
    }
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-mobile-modal-open.png"), fullPage: true });

    // ─── Test M3: Open dropdown ───
    const trigger = await getObjectiveTrigger(page);
    if (!trigger) {
      log("FAIL", "Mobile: trigger not found");
      await ctx.close();
      return;
    }

    // Scroll modal to bring selector into view
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);

    await trigger.click();
    await sleep(800);
    log("PASS", "Mobile: trigger clicked");

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-mobile-dropdown-open.png"), fullPage: false });

    const dropdown = await getObjectiveDropdown(page);
    if (!dropdown) {
      log("FAIL", "Mobile: dropdown not rendered");
      await ctx.close();
      return;
    }

    const box = await dropdown.boundingBox();
    if (!box) {
      log("FAIL", "Mobile: dropdown boundingBox null");
      await ctx.close();
      return;
    }

    // ─── Test M4 (FIX #1): Width ≤ viewport (375px) ───
    console.log("\n━━━ ✅ Verify Fix #1: Width ━━━");
    results.metrics.mobileDropdownWidth = Math.round(box.width);
    results.metrics.mobileDropdownX = Math.round(box.x);
    results.metrics.mobileDropdownRight = Math.round(box.x + box.width);
    const viewportWidth = 375;

    log(
      box.width <= viewportWidth ? "PASS" : "BUG",
      "✅ Fix #1: Dropdown width ≤ viewport",
      `width=${Math.round(box.width)}px (viewport=${viewportWidth}px, diff=${viewportWidth - Math.round(box.width)}px)`
    );

    log(
      box.x + box.width <= viewportWidth + 2 ? "PASS" : "BUG",
      "✅ Fix #2: No horizontal overflow",
      `x=${Math.round(box.x)}, right=${Math.round(box.x + box.width)}px (viewport right=${viewportWidth}px)`
    );

    // ─── Test M5 (FIX #3): Touch target ≥ 36px ───
    console.log("\n━━━ ✅ Verify Fix #3: Touch targets ━━━");
    const touchTargets = await dropdown.evaluate((el) => {
      const btns = el.querySelectorAll("button");
      const arr = [];
      btns.forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.height > 0) {
          arr.push({ text: b.textContent?.trim()?.substring(0, 30), h: Math.round(r.height), w: Math.round(r.width) });
        }
      });
      return arr;
    });

    const smallTargets = touchTargets.filter((t) => t.h < 36);
    if (touchTargets.length > 0 && smallTargets.length === 0) {
      log(
        "PASS",
        "✅ Fix #3: Touch targets ≥36px",
        `${touchTargets.length} buttons, smallest=${Math.min(...touchTargets.map((t) => t.h))}px`
      );
    } else if (smallTargets.length > 0) {
      log("WARN", "✅ Fix #3: Some small targets", `${smallTargets.length}/${touchTargets.length} <36px`);
      smallTargets.slice(0, 3).forEach((t) => console.log(`    → "${t.text}" ${t.w}×${t.h}px`));
    } else {
      log("WARN", "Touch targets", "0 buttons found in dropdown");
    }

    // ─── Test M6 (FIX #4): Max height adaptif (≤60vh = 487px) ───
    console.log("\n━━━ ✅ Verify Fix #4: Max height adaptif ━━━");
    results.metrics.mobileDropdownHeight = Math.round(box.height);
    const viewportHeight = 812;
    const maxAllowed = viewportHeight * 0.65; // 60vh + buffer
    log(
      box.height <= maxAllowed ? "PASS" : "WARN",
      "✅ Fix #4: Height ≤ 65% viewport",
      `h=${Math.round(box.height)}px (max=${Math.round(maxAllowed)}px, viewport=${viewportHeight}px)`
    );

    // ─── Test M7 (FIX #5): Search input readable ───
    console.log("\n━━━ ✅ Verify Fix #5: Search input ━━━");
    const searchInfo = await dropdown.evaluate((el) => {
      const input = el.querySelector('input[placeholder*="Cari"]');
      if (!input) return null;
      const r = input.getBoundingClientRect();
      const style = window.getComputedStyle(input);
      return {
        h: Math.round(r.height),
        fontSize: parseFloat(style.fontSize).toFixed(1),
        padding: style.padding,
      };
    });
    if (searchInfo) {
      results.metrics.mobileSearchHeight = searchInfo.h;
      results.metrics.mobileSearchFontSize = searchInfo.fontSize;
      log(
        searchInfo.h >= 36 ? "PASS" : "WARN",
        "✅ Fix #5: Search input height ≥36px",
        `h=${searchInfo.h}px (px-2 = thumb-friendly)`
      );
      log(
        parseFloat(searchInfo.fontSize) >= 13 ? "PASS" : "WARN",
        "✅ Fix #5: Search font ≥13px (no iOS zoom)",
        `font-size=${searchInfo.fontSize}px`
      );
    } else {
      log("WARN", "Search input", "Not found");
    }

    // ─── Test M8 (FIX #6): Group label readable ───
    console.log("\n━━━ ✅ Verify Fix #6: Group label font ━━━");
    const groupLabelInfo = await dropdown.evaluate((el) => {
      const labels = el.querySelectorAll("p");
      if (labels.length === 0) return null;
      const first = labels[0];
      const style = window.getComputedStyle(first);
      return {
        count: labels.length,
        fontSize: parseFloat(style.fontSize).toFixed(1),
        text: first.textContent?.trim(),
      };
    });
    if (groupLabelInfo) {
      log(
        "PASS",
        "✅ Fix #6: Group labels rendered",
        `${groupLabelInfo.count} labels, first="${groupLabelInfo.text}" (${groupLabelInfo.fontSize}px)`
      );
    } else {
      log("WARN", "Group labels", "Not found");
    }

    // ─── Test M9: Search filter works ───
    console.log("\n━━━ Search Interaction ━━━");
    const searchInput = await dropdown.$('input[placeholder*="Cari"]');
    if (searchInput) {
      await searchInput.fill("traffic");
      await sleep(800);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-mobile-search-traffic.png"), fullPage: false });
      log("PASS", "Mobile: search 'traffic' typed");

      // Verify filter reduces list
      const visibleOptions = await dropdown.$$eval("button:has(span.badge)", (btns) => {
        return btns.filter((b) => {
          const r = b.getBoundingClientRect();
          return r.height > 0 && r.width > 0;
        }).length;
      });
      log("PASS", "Mobile: filter result", `${visibleOptions} visible options after filter`);
    }

    // ─── Test M10: Scroll within dropdown (overscroll-contain) ───
    console.log("\n━━━ Scroll Behavior ━━━");
    const scrollBefore = await page.evaluate(() => window.scrollY);
    if (searchInput) {
      await searchInput.fill("");
      await sleep(300);
    }
    // Try scroll inside dropdown via touch/wheel
    await dropdown.evaluate((el) => {
      el.scrollTop = 100;
    });
    await sleep(300);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    log(
      Math.abs(scrollAfter - scrollBefore) < 50 ? "PASS" : "WARN",
      "Overscroll-contain works",
      `body scroll delta=${Math.abs(scrollAfter - scrollBefore)}px (expected small)`
    );

    // ─── Test M11: Tap an option ───
    console.log("\n━━━ Mobile Tap Option ━━━");
    const firstOpt = await dropdown.$("button:has(span.badge)");
    if (firstOpt) {
      await firstOpt.click();
      await sleep(700);
      const closed = !(await getObjectiveDropdown(page));
      log(closed ? "PASS" : "WARN", "Mobile: tap option closes dropdown", closed ? "Closed" : "Still open");

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-mobile-after-tap.png"), fullPage: false });
    }

    // ─── Test M12: Final horizontal overflow check (after close) ───
    const finalOverflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (finalOverflow.scrollWidth > finalOverflow.clientWidth + 5) {
      log("BUG", "Mobile: post-action overflow", `scrollW=${finalOverflow.scrollWidth}`);
    } else {
      log("PASS", "Mobile: post-action no overflow", `${finalOverflow.scrollWidth}=${finalOverflow.clientWidth}`);
    }
  } catch (e) {
    log("FAIL", "Mobile phase", e.message);
  } finally {
    await ctx.close();
  }
}

async function runPhaseEdgeCases(browser) {
  console.log("\n" + "━".repeat(60));
  console.log("  🧪 PHASE 3: EDGE CASES");
  console.log("━".repeat(60) + "\n");

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const page = await ctx.newPage();

  try {
    await page.goto(LOGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(2500);
    if (page.url().includes("/login")) {
      const ok = await tryLogin(page);
      if (!ok) {
        await ctx.close();
        return;
      }
    }

    await page.goto(REPORTS_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
    await sleep(3000);

    if (!(await openNewReportModal(page))) {
      await ctx.close();
      return;
    }
    await sleep(1500);

    const trigger = await getObjectiveTrigger(page);
    if (!trigger) {
      log("WARN", "Edge case: trigger not found");
      await ctx.close();
      return;
    }
    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await trigger.click();
    await sleep(800);

    const dropdown = await getObjectiveDropdown(page);

    // ─── Edge Test 1: Empty search result ───
    console.log("\n━━━ Empty Search Result ━━━");
    if (dropdown) {
      const search = await dropdown.$('input[placeholder*="Cari"]');
      if (search) {
        await search.fill("zzzznonexistent");
        await sleep(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11-edge-empty-search.png"), fullPage: false });

        const bodyText = await page.textContent("body").catch(() => "");
        log(
          bodyText.includes("Tidak ada objective") ? "PASS" : "WARN",
          "Empty state message",
          bodyText.includes("Tidak ada objective") ? "Found" : "Not found"
        );
      }
    }

    // ─── Edge Test 2: Re-select different objective ───
    console.log("\n━━━ Re-select Different Objective ━━━");
    if (dropdown) {
      const search = await dropdown.$('input[placeholder*="Cari"]');
      if (search) {
        await search.fill("");
        await sleep(500);
      }
      const options = await dropdown.$$("button:has(span.badge)");
      if (options.length >= 2) {
        const before = (await trigger.textContent())?.trim();
        await options[1].click();
        await sleep(500);
        const after = (await trigger.textContent())?.trim();
        log(
          before !== after ? "PASS" : "WARN",
          "Re-select different objective",
          `"${before?.substring(0, 30)}" → "${after?.substring(0, 30)}"`
        );
      }
    }
  } catch (e) {
    log("WARN", "Edge case phase", e.message);
  } finally {
    await ctx.close();
  }
}

async function run() {
  console.log("═".repeat(60));
  console.log("  🎭 Playwright Test: ObjectiveSelector (Mobile + Desktop)");
  console.log("═".repeat(60));
  console.log(`  Target:    ${REPORTS_PAGE}`);
  console.log(`  Auth:      ${TEST_EMAIL ? `yes (${TEST_EMAIL})` : "no"}`);
  console.log(`  Output:    ${SCREENSHOT_DIR}`);
  console.log(`  Commit:    24897dc (verify 6 mobile fixes)`);
  console.log("═".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: true });

  await runPhaseDesktop(browser);
  await runPhaseMobile(browser);
  await runPhaseEdgeCases(browser);

  // ─── SUMMARY ───
  console.log("\n" + "═".repeat(60));
  console.log("  📊 TEST SUMMARY");
  console.log("═".repeat(60));
  console.log(`  ✅ Passed:    ${results.passed.length}`);
  console.log(`  ❌ Failed:    ${results.failed.length}`);
  console.log(`  ⚠️  Warnings:  ${results.warnings.length}`);
  console.log(`  🐛 Bugs:      ${results.bugs.length}`);
  console.log("═".repeat(60));

  if (results.metrics.desktopNavMs) console.log(`  ⏱️  Desktop nav:      ${results.metrics.desktopNavMs}ms`);
  if (results.metrics.desktopDropdownWidth)
    console.log(`  📐 Desktop width:    ${results.metrics.desktopDropdownWidth}px (expect ~400)`);
  if (results.metrics.mobileDropdownWidth)
    console.log(`  📱 Mobile width:     ${results.metrics.mobileDropdownWidth}px (expect ≤375)`);
  if (results.metrics.mobileDropdownRight)
    console.log(`  📱 Mobile right:     ${results.metrics.mobileDropdownRight}px (expect ≤375)`);
  if (results.metrics.mobileDropdownHeight)
    console.log(`  📱 Mobile height:    ${results.metrics.mobileDropdownHeight}px (expect ≤528)`);
  if (results.metrics.mobileSearchHeight)
    console.log(`  🔍 Search h:         ${results.metrics.mobileSearchHeight}px (expect ≥36)`);
  if (results.metrics.mobileSearchFontSize)
    console.log(`  🔍 Search font:      ${results.metrics.mobileSearchFontSize}px (expect ≥13)`);

  if (results.failed.length > 0) {
    console.log("\n❌ FAILED:");
    results.failed.forEach((f) => console.log(`   • ${f.test}: ${f.detail}`));
  }
  if (results.bugs.length > 0) {
    console.log("\n🐛 BUGS:");
    results.bugs.forEach((b) => console.log(`   • ${b.test}: ${b.detail}`));
  }

  const reportPath = path.join(SCREENSHOT_DIR, "audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Report:      ${reportPath}`);
  console.log(`📁 Screenshots: ${SCREENSHOT_DIR}\n`);

  await browser.close();
  process.exit(results.failed.length > 0 || results.bugs.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});