/**
 * 🎭 Playwright FULL AUDIT — All Dashboard Pages
 * Visits every route, checks for: crashes, console errors, API failures,
 * unimplemented features, placeholders, and mobile responsiveness.
 *
 * Usage:
 *   node scripts/playwright-full-audit.mjs
 *   BASE_URL=http://localhost:3000 node scripts/playwright-full-audit.mjs
 *   TEST_LOGIN_EMAIL=xxx TEST_LOGIN_PASSWORD=xxx node scripts/playwright-full-audit.mjs
 *
 * Output:
 *   - scripts/screenshots/audit-full/*.png
 *   - scripts/screenshots/audit-full/audit-report.json
 *   - AUDIT-PLAYWRIGHT.md (root)
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const LOGIN_PAGE = `${BASE_URL}/login`;

const TEST_EMAIL = process.env.TEST_LOGIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "audit-full");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ══════════════════════════════════════════════════════════════
// ALL ROUTES TO AUDIT
// ══════════════════════════════════════════════════════════════
const ROUTES = [
  { path: "/",              label: "Dashboard",          expectData: true },
  { path: "/tasks",         label: "Tasks",              expectData: true },
  { path: "/clients",       label: "Clients",            expectData: true },
  { path: "/ads-spend",     label: "Ads Spend",          expectData: true },
  { path: "/reports",       label: "Weekly Reports",     expectData: true },
  { path: "/strategy",      label: "Strategy (OKR)",     expectData: true },
  { path: "/creative",      label: "Creative Requests",  expectData: true },
  { path: "/content-plans", label: "Content Plans",      expectData: true },
  { path: "/content-studio",label: "Content Studio",     expectData: true },
  { path: "/chat",          label: "Team Chat",          expectData: true },
  { path: "/calendar",      label: "Calendar",           expectData: true },
  { path: "/timesheet",     label: "Timesheet",          expectData: true },
  { path: "/invoices",      label: "Invoices",           expectData: true },
  { path: "/users",         label: "User Management",    expectData: true },
  { path: "/leads",         label: "Leads (CRM)",        expectData: true },
  { path: "/approvals",     label: "Approvals",          expectData: true },
  { path: "/production",    label: "Production",         expectData: true },
  { path: "/brand-kits",    label: "Brand Kits",         expectData: true },
  { path: "/settings",      label: "Settings",           expectData: false },
];

// Patterns that indicate unimplemented features
const PLACEHOLDER_PATTERNS = [
  /coming\s+soon/i,
  /todo\b/i,
  /not\s+implemented/i,
  /work\s+in\s+progress/i,
  /under\s+construction/i,
  /placeholder/i,
  /lorem\s+ipsum/i,
  /WIP\b/,
  /TBD\b/,
  /belum\s+tersedia/i,
  /belum\s+tersedia/i,
  /coming\s+soon/i,
  /segera/i,
  /dalam\s+pengembangan/i,
];

const results = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  authenticated: false,
  routes: [],
  summary: { passed: 0, failed: 0, warnings: 0, bugs: 0, unimplemented: 0, total: 0 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sanitizeFilename(s) {
  return s.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

async function tryLogin(page) {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.log("  ⚠️  TEST_LOGIN_EMAIL/PASSWORD not set — will audit anonymously (pre-auth only)");
    return false;
  }

  try {
    console.log(`  🔑 Logging in as ${TEST_EMAIL}...`);
    await page.goto(LOGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 15000 });
    await sleep(2000);

    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const pwInput = await page.$('input[type="password"], input[name="password"]');

    if (!emailInput || !pwInput) {
      console.log("  ⚠️  Login form not found (mungkin hanya OAuth Google)");
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

    await sleep(4000);
    const url = page.url();
    if (url.includes("/login") || url.includes("/auth")) {
      console.log("  ❌ Login failed — still on auth page");
      return false;
    }

    console.log(`  ✅ Login successful — redirected to ${url}`);
    results.authenticated = true;
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "00-after-login.png"), fullPage: true });
    return true;
  } catch (e) {
    console.log(`  ⚠️  Login error: ${e.message}`);
    return false;
  }
}

/**
 * Audit a single route on desktop viewport
 */
async function auditRoute(browser, route, isLoggedIn) {
  const routeResult = {
    path: route.path,
    label: route.label,
    status: "unknown",
    loadMs: null,
    httpStatus: null,
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
    placeholders: [],
    hasHeading: false,
    headingText: null,
    buttonCount: 0,
    formCount: 0,
    tableCount: 0,
    cardCount: 0,
    linkCount: 0,
    hasData: false,
    bodyLength: 0,
    mobileOverflow: null,
    issues: [],
  };

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const page = await context.newPage();

  // Capture errors
  page.on("console", (msg) => {
    if (msg.type() === "error") routeResult.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => routeResult.pageErrors.push(err.message));
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      routeResult.apiFailures.push({
        url: res.url().replace(BASE_URL, ""),
        status: res.status(),
      });
    }
  });

  const url = `${BASE_URL}${route.path}`;
  console.log(`\n  📄 [${route.label}] ${route.path}`);

  try {
    const t = Date.now();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    routeResult.loadMs = Date.now() - t;
    routeResult.httpStatus = res?.status() ?? null;
    await sleep(3000); // Wait for client-side data fetch

    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes("/login") || currentUrl.includes("/auth");

    // Screenshot
    const ssName = sanitizeFilename(route.label);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `desktop-${ssName}.png`), fullPage: true });

    // If not logged in and redirected, mark and return
    if (redirectedToLogin) {
      routeResult.status = "auth-required";
      routeResult.issues.push("Redirected to login (not authenticated)");
      console.log(`  🔒 Redirected to login`);
      results.summary.warnings++;
      await context.close();
      return routeResult;
    }

    // Check for error boundary / crash
    const bodyText = await page.textContent("body").catch(() => "");
    routeResult.bodyLength = bodyText.length;

    if (bodyText.includes("Application error") || bodyText.includes("Something went wrong") || bodyText.includes("Unhandled")) {
      routeResult.status = "crash";
      routeResult.issues.push("Error boundary / crash detected");
      results.summary.bugs++;
      console.log(`  💥 CRASH detected!`);
    }

    // Check heading
    const h1 = await page.textContent("h1").catch(() => null);
    if (h1 && h1.trim().length > 0) {
      routeResult.hasHeading = true;
      routeResult.headingText = h1.trim().substring(0, 80);
    }

    // Count interactive elements
    routeResult.buttonCount = await page.locator("button").count();
    routeResult.formCount = await page.locator("form").count();
    routeResult.tableCount = await page.locator("table").count();
    routeResult.linkCount = await page.locator("a").count();
    routeResult.cardCount = await page.locator(".card, [class*='rounded-lg'][class*='border']").count();

    // Check if has actual data (not empty state)
    const isEmpty = bodyText.match(/tidak\s+ada\s+(data|report|task|client|data|item|result)/i)
      || bodyText.match(/no\s+(data|items|results|records|entries|reports)\s+(found|available|yet)/i)
      || bodyText.match(/belum\s+ada\s+(data|report|task|client)/i)
      || bodyText.match(/empty/i);
    routeResult.hasData = !isEmpty && routeResult.cardCount > 0;

    // Check for placeholders / unimplemented
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(bodyText)) {
        const match = bodyText.match(pattern);
        routeResult.placeholders.push(match[0]);
        routeResult.issues.push(`Unimplemented/placeholder text: "${match[0]}"`);
      }
    }

    // Check very low content (might be broken)
    if (bodyText.trim().length < 100) {
      routeResult.issues.push(`Very low body content (${bodyText.trim().length} chars) — might be broken`);
      results.summary.warnings++;
    }

    // Evaluate status
    if (routeResult.status === "crash") {
      // already set
    } else if (routeResult.placeholders.length > 0) {
      routeResult.status = "unimplemented";
      results.summary.unimplemented++;
    } else if (routeResult.pageErrors.length > 0) {
      routeResult.status = "page-error";
      results.summary.bugs++;
    } else if (routeResult.consoleErrors.length > 3) {
      routeResult.status = "errors";
      results.summary.warnings++;
    } else {
      routeResult.status = "ok";
      results.summary.passed++;
    }

    // Console errors summary
    if (routeResult.consoleErrors.length > 0) {
      console.log(`  🐛 ${routeResult.consoleErrors.length} console errors`);
    }
    if (routeResult.apiFailures.length > 0) {
      console.log(`  ⚠️  ${routeResult.apiFailures.length} API failures`);
    }

    // Status icon
    const icon =
      routeResult.status === "ok" ? "✅" :
      routeResult.status === "crash" ? "💥" :
      routeResult.status === "unimplemented" ? "🚧" :
      routeResult.status === "page-error" ? "🐛" :
      routeResult.status === "errors" ? "⚠️" :
      routeResult.status === "auth-required" ? "🔒" : "❓";
    console.log(`  ${icon} Status: ${routeResult.status} (${routeResult.loadMs}ms)`);
    console.log(`  📊 buttons=${routeResult.buttonCount} forms=${routeResult.formCount} tables=${routeResult.tableCount} cards=${routeResult.cardCount} links=${routeResult.linkCount}`);
    if (routeResult.hasHeading) {
      console.log(`  📝 H1: "${routeResult.headingText}"`);
    }
    if (routeResult.placeholders.length > 0) {
      console.log(`  🚧 Placeholders: ${routeResult.placeholders.join(", ")}`);
    }

    // ─── Mobile Check ───
    await page.setViewportSize({ width: 375, height: 812 });
    await sleep(1000);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 5) {
      routeResult.mobileOverflow = overflow.scrollWidth - overflow.clientWidth;
      routeResult.issues.push(`Mobile horizontal overflow: ${routeResult.mobileOverflow}px`);
      results.summary.warnings++;
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `mobile-${ssName}.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });

  } catch (e) {
    routeResult.status = "fail";
    routeResult.issues.push(`Navigation failed: ${e.message}`);
    results.summary.failed++;
    console.log(`  ❌ FAIL: ${e.message}`);
  }

  results.routes.push(routeResult);
  await context.close();
  return routeResult;
}

/**
 * Generate markdown report
 */
function generateMarkdown() {
  const lines = [];

  lines.push("# 🎭 Playwright Full Audit Report");
  lines.push("");
  lines.push(`**Date:** ${results.startedAt}`);
  lines.push(`**Base URL:** ${BASE_URL}`);
  lines.push(`**Authenticated:** ${results.authenticated ? "✅ Yes" : "❌ No (anonymous)"}`);
  lines.push("");

  // Summary
  lines.push("## 📊 Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---|");
  lines.push(`| ✅ Passed (OK) | ${results.summary.passed} |`);
  lines.push(`| 💥 Crashes | ${results.summary.bugs} |`);
  lines.push(`| 🚧 Unimplemented | ${results.summary.unimplemented} |`);
  lines.push(`| ⚠️ Warnings | ${results.summary.warnings} |`);
  lines.push(`| ❌ Failed | ${results.summary.failed} |`);
  lines.push(`| **Total Routes** | **${ROUTES.length}** |`);
  lines.push("");

  // Route Status Table
  lines.push("## 📄 Route Status");
  lines.push("");
  lines.push("| Route | Status | Load (ms) | Console Errs | API Fails | Placeholders | H1 | Buttons | Cards | Issues |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|");

  for (const r of results.routes) {
    const icon =
      r.status === "ok" ? "✅" :
      r.status === "crash" ? "💥" :
      r.status === "unimplemented" ? "🚧" :
      r.status === "page-error" ? "🐛" :
      r.status === "errors" ? "⚠️" :
      r.status === "auth-required" ? "🔒" :
      r.status === "fail" ? "❌" : "❓";
    const issues = r.issues.length > 0 ? r.issues[0].substring(0, 50) : "—";
    lines.push(
      `| ${icon} \`${r.path}\` ${r.label} | ${r.status} | ${r.loadMs ?? "—"} | ${r.consoleErrors.length} | ${r.apiFailures.length} | ${r.placeholders.length} | ${r.hasHeading ? "✅" : "❌"} | ${r.buttonCount} | ${r.cardCount} | ${issues} |`
    );
  }
  lines.push("");

  // Detailed Issues
  const problemRoutes = results.routes.filter(
    (r) => r.status !== "ok" && r.status !== "auth-required"
  );

  if (problemRoutes.length > 0) {
    lines.push("## 🔍 Detailed Findings");
    lines.push("");

    for (const r of problemRoutes) {
      lines.push(`### ${r.label} — \`${r.path}\``);
      lines.push(`**Status:** \`${r.status}\` | **Load:** ${r.loadMs}ms | **HTTP:** ${r.httpStatus}`);
      lines.push("");

      if (r.issues.length > 0) {
        lines.push("**Issues:**");
        for (const issue of r.issues) {
          lines.push(`- ${issue}`);
        }
        lines.push("");
      }

      if (r.consoleErrors.length > 0) {
        lines.push("**Console Errors:**");
        for (const e of r.consoleErrors.slice(0, 5)) {
          lines.push(`- \`${e.substring(0, 150)}\``);
        }
        lines.push("");
      }

      if (r.apiFailures.length > 0) {
        lines.push("**API Failures:**");
        for (const f of r.apiFailures.slice(0, 5)) {
          lines.push(`- ${f.status} \`${f.url}\``);
        }
        lines.push("");
      }

      if (r.placeholders.length > 0) {
        lines.push("**Unimplemented/Placeholder Text:**");
        for (const p of r.placeholders) {
          lines.push(`- \`${p}\``);
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }
  }

  // Recommendations
  lines.push("## 💡 Recommendations");
  lines.push("");

  const crashes = results.routes.filter((r) => r.status === "crash");
  const unimplemented = results.routes.filter((r) => r.status === "unimplemented");
  const pageErrors = results.routes.filter((r) => r.status === "page-error");
  const errorRoutes = results.routes.filter((r) => r.status === "errors");
  const overflowRoutes = results.routes.filter((r) => r.mobileOverflow);

  if (crashes.length > 0) {
    lines.push("### 🔴 Critical — Page Crashes");
    crashes.forEach((r) => lines.push(`- \`${r.path}\` — ${r.issues.join("; ")}`));
    lines.push("");
  }

  if (pageErrors.length > 0) {
    lines.push("### 🟡 High — Uncaught Exceptions");
    pageErrors.forEach((r) => lines.push(`- \`${r.path}\` — ${r.pageErrors.slice(0, 2).join("; ")}`));
    lines.push("");
  }

  if (unimplemented.length > 0) {
    lines.push("### 🟠 Medium — Unimplemented Features");
    unimplemented.forEach((r) => lines.push(`- \`${r.path}\` — ${r.placeholders.join(", ")}`));
    lines.push("");
  }

  if (errorRoutes.length > 0) {
    lines.push("### ⚠️ Low — Console Errors");
    errorRoutes.forEach((r) => lines.push(`- \`${r.path}\` — ${r.consoleErrors.length} console errors`));
    lines.push("");
  }

  if (overflowRoutes.length > 0) {
    lines.push("### 📱 Mobile Issues — Horizontal Overflow");
    overflowRoutes.forEach((r) => lines.push(`- \`${r.path}\` — overflow ${r.mobileOverflow}px`));
    lines.push("");
  }

  if (crashes.length === 0 && unimplemented.length === 0 && pageErrors.length === 0) {
    lines.push("✅ No critical issues found. All audited routes are functional.");
    lines.push("");
  }

  return lines.join("\n");
}

async function run() {
  console.log("═".repeat(70));
  console.log("  🎭 Playwright FULL AUDIT — All Dashboard Pages");
  console.log("═".repeat(70));
  console.log(`  Base URL:    ${BASE_URL}`);
  console.log(`  Auth:        ${TEST_EMAIL ? `yes (${TEST_EMAIL})` : "no (anonymous)"}`);
  console.log(`  Routes:      ${ROUTES.length}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log("═".repeat(70));

  const browser = await chromium.launch({ headless: true });

  // Login context
  const loginCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });
  const loginPage = await loginCtx.newPage();

  const isLoggedIn = await tryLogin(loginPage);

  // If logged in, get cookies and reuse
  let cookies = [];
  let localStorage = {};
  if (isLoggedIn) {
    cookies = await loginCtx.cookies();
    localStorage = await loginPage.evaluate(() => JSON.stringify(window.localStorage));
  }

  await loginCtx.close();

  // ══════════════════════════════════════════════════════════════
  // AUDIT EACH ROUTE
  // ══════════════════════════════════════════════════════════════
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📄 AUDITING ALL ROUTES");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  for (const route of ROUTES) {
    // Create context with auth if available
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      storageState: undefined,
    });

    if (isLoggedIn) {
      await context.addCookies(cookies);
    }

    // Set localStorage if available
    const page = await context.newPage();
    if (isLoggedIn && localStorage) {
      await page.addInitScript((ls) => {
        try {
          const items = JSON.parse(ls);
          for (const [k, v] of Object.entries(items)) {
            window.localStorage.setItem(k, v);
          }
        } catch (e) {}
      }, localStorage);
    }

    // Now run audit on this context's page
    await context.close();

    // Re-create properly: use auditRoute which makes its own context
    // But we need to inject auth — so modify approach:
    const routeResult = await auditRouteWithAuth(browser, route, isLoggedIn, cookies, localStorage);
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  results.summary.total = ROUTES.length;

  console.log("\n" + "═".repeat(70));
  console.log("  📊 AUDIT SUMMARY");
  console.log("═".repeat(70));
  console.log(`  ✅ Passed:        ${results.summary.passed}`);
  console.log(`  💥 Crashes:       ${results.summary.bugs}`);
  console.log(`  🚧 Unimplemented: ${results.summary.unimplemented}`);
  console.log(`  ⚠️  Warnings:      ${results.summary.warnings}`);
  console.log(`  ❌ Failed:        ${results.summary.failed}`);
  console.log(`  📄 Total Routes:  ${results.summary.total}`);
  console.log("═".repeat(70));

  // Route-by-route summary
  console.log("\n📄 Route Results:");
  for (const r of results.routes) {
    const icon =
      r.status === "ok" ? "✅" :
      r.status === "crash" ? "💥" :
      r.status === "unimplemented" ? "🚧" :
      r.status === "page-error" ? "🐛" :
      r.status === "errors" ? "⚠️" :
      r.status === "auth-required" ? "🔒" :
      r.status === "fail" ? "❌" : "❓";
    console.log(`  ${icon} ${r.label.padEnd(20)} ${r.status.padEnd(15)} ${r.loadMs ?? "—"}ms`);
  }

  // Save JSON report
  const jsonPath = path.join(SCREENSHOT_DIR, "audit-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 JSON Report:  ${jsonPath}`);
  console.log(`📁 Screenshots:  ${SCREENSHOT_DIR}`);

  // Save Markdown report
  const mdReport = generateMarkdown();
  const mdPath = path.join(process.cwd(), "AUDIT-PLAYWRIGHT.md");
  fs.writeFileSync(mdPath, mdReport);
  console.log(`📁 MD Report:    ${mdPath}`);

  await browser.close();
  process.exit(0);
}

/**
 * Audit route with auth injection
 */
async function auditRouteWithAuth(browser, route, isLoggedIn, cookies, localStorage) {
  const routeResult = {
    path: route.path,
    label: route.label,
    status: "unknown",
    loadMs: null,
    httpStatus: null,
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
    placeholders: [],
    hasHeading: false,
    headingText: null,
    buttonCount: 0,
    formCount: 0,
    tableCount: 0,
    cardCount: 0,
    linkCount: 0,
    hasData: false,
    bodyLength: 0,
    mobileOverflow: null,
    issues: [],
  };

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: undefined,
  });

  if (isLoggedIn && cookies.length > 0) {
    await context.addCookies(cookies);
  }

  const page = await context.newPage();

  // Inject localStorage
  if (isLoggedIn && localStorage) {
    await page.addInitScript((ls) => {
      try {
        const items = JSON.parse(ls);
        for (const [k, v] of Object.entries(items)) {
          window.localStorage.setItem(k, v);
        }
      } catch (e) {}
    }, localStorage);
  }

  // Capture errors
  page.on("console", (msg) => {
    if (msg.type() === "error") routeResult.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => routeResult.pageErrors.push(err.message));
  page.on("response", (res) => {
    if (res.url().includes("/api/") && res.status() >= 400) {
      routeResult.apiFailures.push({
        url: res.url().replace(BASE_URL, ""),
        status: res.status(),
      });
    }
  });

  const url = `${BASE_URL}${route.path}`;
  console.log(`\n  📄 [${route.label}] ${route.path}`);

  try {
    const t = Date.now();
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    routeResult.loadMs = Date.now() - t;
    routeResult.httpStatus = res?.status() ?? null;
    await sleep(3000);

    const currentUrl = page.url();
    const redirectedToLogin = currentUrl.includes("/login") || currentUrl.includes("/auth");

    // Screenshot
    const ssName = sanitizeFilename(route.label);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `desktop-${ssName}.png`), fullPage: true });

    if (redirectedToLogin) {
      routeResult.status = "auth-required";
      routeResult.issues.push("Redirected to login");
      console.log(`  🔒 Auth required`);
      results.routes.push(routeResult);
      results.summary.warnings++;
      await context.close();
      return routeResult;
    }

    // Check for crash
    const bodyText = await page.textContent("body").catch(() => "");
    routeResult.bodyLength = bodyText.length;

    if (bodyText.includes("Application error") || bodyText.includes("Something went wrong") || bodyText.includes("Unhandled Runtime Error")) {
      routeResult.status = "crash";
      routeResult.issues.push("Error boundary / crash detected");
      results.summary.bugs++;
      console.log(`  💥 CRASH!`);
    }

    // Heading
    const h1 = await page.textContent("h1").catch(() => null);
    if (h1 && h1.trim().length > 0) {
      routeResult.hasHeading = true;
      routeResult.headingText = h1.trim().substring(0, 80);
    }

    // Interactive elements
    routeResult.buttonCount = await page.locator("button").count();
    routeResult.formCount = await page.locator("form").count();
    routeResult.tableCount = await page.locator("table").count();
    routeResult.linkCount = await page.locator("a").count();
    routeResult.cardCount = await page.locator(".card, [class*='rounded-lg'][class*='border']").count();

    // Empty state
    const isEmpty = bodyText.match(/tidak\s+ada\s+(data|report|task|client|item|result)/i)
      || bodyText.match(/no\s+(data|items|results|records)\s+(found|available|yet)/i)
      || bodyText.match(/belum\s+ada\s+(data|report|task|client)/i)
      || bodyText.match(/empty\s+state/i);
    routeResult.hasData = !isEmpty && routeResult.cardCount > 0;

    // Placeholders
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(bodyText)) {
        const match = bodyText.match(pattern);
        routeResult.placeholders.push(match[0]);
      }
    }

    if (routeResult.placeholders.length > 0) {
      routeResult.issues.push(`Unimplemented text: ${routeResult.placeholders.join(", ")}`);
    }

    // Low content warning
    if (bodyText.trim().length < 100) {
      routeResult.issues.push(`Very low content (${bodyText.trim().length} chars)`);
      results.summary.warnings++;
    }

    // Final status
    if (routeResult.status === "crash") {
      // already set
    } else if (routeResult.placeholders.length > 0) {
      routeResult.status = "unimplemented";
      results.summary.unimplemented++;
    } else if (routeResult.pageErrors.length > 0) {
      routeResult.status = "page-error";
      results.summary.bugs++;
    } else if (routeResult.consoleErrors.length > 3) {
      routeResult.status = "errors";
      results.summary.warnings++;
    } else {
      routeResult.status = "ok";
      results.summary.passed++;
    }

    // Console errors
    if (routeResult.consoleErrors.length > 0) {
      console.log(`  🐛 ${routeResult.consoleErrors.length} console errors`);
    }
    if (routeResult.apiFailures.length > 0) {
      console.log(`  ⚠️  ${routeResult.apiFailures.length} API failures`);
    }

    const icon =
      routeResult.status === "ok" ? "✅" :
      routeResult.status === "crash" ? "💥" :
      routeResult.status === "unimplemented" ? "🚧" :
      routeResult.status === "page-error" ? "🐛" :
      routeResult.status === "errors" ? "⚠️" :
      routeResult.status === "auth-required" ? "🔒" : "❓";
    console.log(`  ${icon} ${routeResult.status} (${routeResult.loadMs}ms)`);
    console.log(`  📊 btn=${routeResult.buttonCount} form=${routeResult.formCount} table=${routeResult.tableCount} card=${routeResult.cardCount} link=${routeResult.linkCount}`);
    if (routeResult.hasHeading) {
      console.log(`  📝 H1: "${routeResult.headingText}"`);
    }
    if (routeResult.placeholders.length > 0) {
      console.log(`  🚧 Placeholders: ${routeResult.placeholders.join(", ")}`);
    }

    // Mobile overflow check
    await page.setViewportSize({ width: 375, height: 812 });
    await sleep(800);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth + 5) {
      routeResult.mobileOverflow = overflow.scrollWidth - overflow.clientWidth;
      routeResult.issues.push(`Mobile overflow: ${routeResult.mobileOverflow}px`);
      results.summary.warnings++;
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `mobile-${ssName}.png`), fullPage: true });

  } catch (e) {
    routeResult.status = "fail";
    routeResult.issues.push(`Navigation failed: ${e.message}`);
    results.summary.failed++;
    console.log(`  ❌ FAIL: ${e.message}`);
  }

  results.routes.push(routeResult);
  await context.close();
  return routeResult;
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});