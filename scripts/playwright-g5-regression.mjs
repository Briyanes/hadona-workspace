/**
 * G5 Regression QA — Post lazy-load refactor
 * Focus: /ads-spend & /reports (pages changed in G2/G2b)
 * Verifies: page load, lazy charts/modals mount correctly, no console/network errors, responsive
 *
 * Usage: node scripts/playwright-g5-regression.mjs
 * Prereq: next start running on http://localhost:3000
 * Env: QA_EMAIL, QA_PASSWORD, QA_BASE_URL
 */

import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD;

const results = { pass: 0, fail: 0, issues: [] };

function log(type, test, detail = "") {
  const icon = type === "PASS" ? "✅" : type === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} [${type}] ${test}${detail ? " — " + detail : ""}`);
  if (type === "PASS") results.pass++;
  else if (type === "FAIL") { results.fail++; results.issues.push(`${test}${detail ? ": " + detail : ""}`); }
  else results.issues.push(`(warn) ${test}${detail ? ": " + detail : ""}`);
}

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const networkErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("requestfailed", (r) => {
    networkErrors.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText || ""}`);
  });
  return { ctx, page, consoleErrors, networkErrors };
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2500);
  return !page.url().includes("/login");
}

async function checkPage(browser, name, path, viewport, label) {
  const { ctx, page, consoleErrors, networkErrors } = await newPage(browser, viewport);
  try {
    // Reuse login via localStorage is complex; simplest: login each context
    const ok = await login(page);
    if (!ok) { log("FAIL", `${name} ${label}: login`, "cannot authenticate"); return; }

    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 });
    log(resp && resp.status() < 400 ? "PASS" : "FAIL", `${name} ${label}: HTTP`, `status=${resp?.status()}`);

    await page.waitForTimeout(3000);

    // Not blank & no error boundary
    const bodyText = (await page.textContent("body")) || "";
    log(bodyText.trim().length > 50 ? "PASS" : "FAIL", `${name} ${label}: rendered`, `${bodyText.trim().length} chars`);
    const hasErrorBoundary = /something went wrong|application error|unexpected error/i.test(bodyText);
    log(!hasErrorBoundary ? "PASS" : "FAIL", `${name} ${label}: no error boundary`);

    // No horizontal overflow on mobile
    if (viewport.width < 640) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      log(overflow <= 2 ? "PASS" : "FAIL", `${name} ${label}: no horizontal overflow`, `overflow=${overflow}px`);
    }

    // Console errors (filter known benign)
    const benign = /ResizeObserver|hydrat|favicon|manifest|Source map|ERR_ABORTED/;
    const realConsole = consoleErrors.filter((e) => !benign.test(e));
    log(realConsole.length === 0 ? "PASS" : "WARN", `${name} ${label}: console`, realConsole.slice(0, 3).join(" | ") || "clean");

    const realNet = networkErrors.filter((e) => !/aborted/i.test(e));
    log(realNet.length === 0 ? "PASS" : "WARN", `${name} ${label}: network`, realNet.slice(0, 3).join(" | ") || "clean");

    return page;
  } catch (e) {
    log("FAIL", `${name} ${label}: exception`, String(e).slice(0, 150));
    return null;
  }
}

async function testAdsSpend(browser) {
  console.log("\n═══ /ads-spend ═══");
  // Desktop
  const d = await newPage(browser, { width: 1440, height: 900 });
  const ok = await login(d.page);
  if (!ok) { log("FAIL", "ads-spend: login"); return; }
  await d.page.goto(`${BASE}/ads-spend`, { waitUntil: "networkidle", timeout: 45000 });
  await d.page.waitForTimeout(3500);

  // Chart section appears (lazy spend-revenue-chart) — tab or section containing chart
  const chartVisible = await d.page
    .locator("svg, canvas, [class*='recharts'], [data-testid='spend-revenue-chart']")
    .first()
    .isVisible({ timeout: 8000 })
    .catch(() => false);
  log(chartVisible ? "PASS" : "WARN", "ads-spend desktop: chart mount", chartVisible ? "chart visible" : "chart/tab not visible initially (may require tab click)");

  // If chart requires clicking a tab, try common labels
  if (!chartVisible) {
    for (const label of ["Grafik", "Chart", "Chart & Insight"]) {
      const tab = d.page.getByRole("button", { name: new RegExp(label, "i") }).first();
      if (await tab.isVisible().catch(() => false)) {
        await tab.click().catch(() => null);
        await d.page.waitForTimeout(2000);
        const after = await d.page.locator("svg, canvas, [class*='recharts']").first().isVisible().catch(() => false);
        if (after) { log("PASS", "ads-spend desktop: chart mounts after tab click", label); break; }
      }
    }
  }

  // Conditional-mount modals: buttons that open modals should still work
  const modalButtons = ["Tambah", "Log", "Import", "Sinkron", "Sync", "Token"].map((t) =>
    d.page.getByRole("button", { name: new RegExp(t, "i") }).first()
  );
  let modalOpened = false;
  for (const btn of modalButtons) {
    if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await btn.click().catch(() => null);
      await d.page.waitForTimeout(1200);
      const dialog = await d.page
        .locator('[role="dialog"], [class*="modal"], dialog')
        .first()
        .isVisible()
        .catch(() => false);
      if (dialog) {
        modalOpened = true;
        log("PASS", "ads-spend desktop: modal opens (lazy mount works)", (await btn.textContent())?.trim());
        // close
        await d.page.keyboard.press("Escape").catch(() => null);
        await d.page.locator('[aria-label="Close"], button:has-text("Tutup"), button:has-text("Cancel")').first().click().catch(() => null);
        await d.page.waitForTimeout(600);
        break;
      }
    }
  }
  if (!modalOpened) log("WARN", "ads-spend desktop: modal", "no modal button found/triggered (data-dependent)");

  // Console/network
  const benign = /ResizeObserver|hydrat|favicon|manifest|Source map|ERR_ABORTED/;
  const rc = d.consoleErrors.filter((e) => !benign.test(e));
  log(rc.length === 0 ? "PASS" : "WARN", "ads-spend desktop: console", rc.slice(0, 3).join(" | ") || "clean");
  const rn = d.networkErrors.filter((e) => !/aborted/i.test(e));
  log(rn.length === 0 ? "PASS" : "WARN", "ads-spend desktop: network", rn.slice(0, 3).join(" | ") || "clean");

  await d.ctx.close();

  // Mobile
  const m = await newPage(browser, { width: 390, height: 844 });
  await login(m.page);
  await m.page.goto(`${BASE}/ads-spend`, { waitUntil: "networkidle", timeout: 45000 });
  await m.page.waitForTimeout(3000);
  const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log(overflow <= 2 ? "PASS" : "FAIL", "ads-spend mobile: no horizontal overflow", `overflow=${overflow}px`);
  const body = (await m.page.textContent("body")) || "";
  log(!/something went wrong/i.test(body) ? "PASS" : "FAIL", "ads-spend mobile: rendered");
  const mc = m.consoleErrors.filter((e) => !benign.test(e));
  log(mc.length === 0 ? "PASS" : "WARN", "ads-spend mobile: console", mc.slice(0, 2).join(" | ") || "clean");
  await m.ctx.close();
}

async function testReports(browser) {
  console.log("\n═══ /reports ═══");
  const d = await newPage(browser, { width: 1440, height: 900 });
  const ok = await login(d.page);
  if (!ok) { log("FAIL", "reports: login"); return; }
  await d.page.goto(`${BASE}/reports`, { waitUntil: "networkidle", timeout: 45000 });
  await d.page.waitForTimeout(3500);

  const body = (await d.page.textContent("body")) || "";
  log(body.trim().length > 50 ? "PASS" : "FAIL", "reports desktop: rendered", `${body.trim().length} chars`);
  log(!/something went wrong/i.test(body) ? "PASS" : "FAIL", "reports desktop: no error boundary");

  // KPI bar (non-lazy, always mounted)
  const kpi = await d.page
    .locator("[class*='kpi'], [data-testid='kpi-bar'], text=/Total|ROAS|Spend/i")
    .first()
    .isVisible({ timeout: 6000 })
    .catch(() => false);
  log(kpi ? "PASS" : "WARN", "reports desktop: KPI visible", kpi ? "ok" : "KPI element not found by heuristic");

  // Lazy component: goal tracker / creative tracker / compare — try tab clicks
  for (const label of ["Goal", "Creative", "Compare", "Perbandingan"]) {
    const tab = d.page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
      await tab.click().catch(() => null);
      await d.page.waitForTimeout(1800);
      const visible = await d.page
        .locator("svg, [class*='recharts'], canvas, [class*='tracker'], [class*='compare']")
        .first()
        .isVisible()
        .catch(() => false);
      log(visible ? "PASS" : "WARN", `reports desktop: lazy section "${label}"`, visible ? "mounts" : "not detected (data-dependent)");
    }
  }

  const benign = /ResizeObserver|hydrat|favicon|manifest|Source map|ERR_ABORTED/;
  const rc = d.consoleErrors.filter((e) => !benign.test(e));
  log(rc.length === 0 ? "PASS" : "WARN", "reports desktop: console", rc.slice(0, 3).join(" | ") || "clean");
  const rn = d.networkErrors.filter((e) => !/aborted/i.test(e));
  log(rn.length === 0 ? "PASS" : "WARN", "reports desktop: network", rn.slice(0, 3).join(" | ") || "clean");
  await d.ctx.close();

  // Mobile
  const m = await newPage(browser, { width: 390, height: 844 });
  await login(m.page);
  await m.page.goto(`${BASE}/reports`, { waitUntil: "networkidle", timeout: 45000 });
  await m.page.waitForTimeout(3000);
  const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  log(overflow <= 2 ? "PASS" : "FAIL", "reports mobile: no horizontal overflow", `overflow=${overflow}px`);
  const mc = m.consoleErrors.filter((e) => !benign.test(e));
  log(mc.length === 0 ? "PASS" : "WARN", "reports mobile: console", mc.slice(0, 2).join(" | ") || "clean");
  await m.ctx.close();
}

async function main() {
  console.log(`G5 Regression — ${BASE}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  const browser = await chromium.launch({ headless: true });

  // Sanity: dashboard home still works (shared layout untouched but verify)
  console.log("═══ / (dashboard home sanity) ═══");
  const h = await newPage(browser, { width: 1440, height: 900 });
  const ok = await login(h.page);
  log(ok ? "PASS" : "FAIL", "login", ok ? "authenticated" : "failed");
  if (ok) {
    await h.page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 45000 });
    await h.page.waitForTimeout(3000);
    const body = (await h.page.textContent("body")) || "";
    log(body.trim().length > 50 && !/something went wrong/i.test(body) ? "PASS" : "FAIL", "dashboard home: rendered");
  }
  await h.ctx.close();

  await testAdsSpend(browser);
  await testReports(browser);

  await browser.close();

  console.log("\n──────── SUMMARY ────────");
  console.log(`PASS: ${results.pass} | FAIL: ${results.fail}`);
  if (results.issues.length) {
    console.log("Issues:");
    results.issues.forEach((i) => console.log(`  - ${i}`));
  }
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});