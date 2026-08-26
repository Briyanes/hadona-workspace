#!/usr/bin/env node
/**
 * 🔐 Playwright Authenticated Audit
 *
 * Logs in as admin, then visits ALL routes (sidebar + settings sub-pages).
 * Captures: console errors, API failures, JS errors, dead/placeholder text,
 * load times, screenshots (desktop + mobile), and data presence.
 *
 * Usage:
 *   node scripts/playwright-auth-audit.mjs
 *
 * Env:
 *   AUDIT_EMAIL     — login email    (required — no hardcoded defaults)
 *   AUDIT_PASSWORD  — login password (required — no hardcoded defaults)
 *   AUDIT_BASE_URL  — base URL       (default: http://localhost:3000)
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.AUDIT_BASE_URL || "http://localhost:3000";
// Credentials via env only — never hardcode secrets in the repo
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("❌ Set AUDIT_EMAIL and AUDIT_PASSWORD env vars first!");
  console.error("   Usage: AUDIT_EMAIL=xxx AUDIT_PASSWORD=xxx node scripts/playwright-auth-audit.mjs");
  process.exit(1);
}

const SCREENSHOT_DIR = "scripts/screenshots/audit-auth";
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ── All routes to audit ──
const ROUTES = [
  // Main sidebar routes
  { path: "/", label: "Dashboard", group: "main" },
  { path: "/tasks", label: "Tasks", group: "main" },
  { path: "/clients", label: "Clients", group: "main" },
  { path: "/ads-spend", label: "Ads Spend", group: "main" },
  { path: "/reports", label: "Weekly Reports", group: "main" },
  { path: "/strategy", label: "Strategy (OKR)", group: "main" },
  { path: "/creative", label: "Creative Requests", group: "main" },
  { path: "/content-plans", label: "Content Plans", group: "main" },
  { path: "/chat", label: "Team Chat", group: "main" },
  { path: "/calendar", label: "Calendar", group: "main" },
  { path: "/timesheet", label: "Timesheet", group: "main" },
  { path: "/invoices", label: "Invoices", group: "main" },
  { path: "/users", label: "User Management", group: "main" },
  // New routes (v78+v79)
  { path: "/content-studio", label: "Content Studio", group: "main" },
  { path: "/leads", label: "Leads (CRM)", group: "main" },
  { path: "/approvals", label: "Approvals", group: "main" },
  { path: "/production", label: "Production", group: "main" },
  { path: "/brand-kits", label: "Brand Kits", group: "main" },
  // Settings sub-pages
  { path: "/settings", label: "Settings (Index)", group: "settings" },
  { path: "/settings/profile", label: "Settings → Profile", group: "settings" },
  { path: "/settings/notifications", label: "Settings → Notifications", group: "settings" },
  { path: "/settings/security", label: "Settings → Security", group: "settings" },
  { path: "/settings/workspace", label: "Settings → Workspace", group: "settings" },
  { path: "/settings/preferences", label: "Settings → Preferences", group: "settings" },
  { path: "/settings/integrations", label: "Settings → Integrations", group: "settings" },
];

// Placeholder / dead-code patterns
const PLACEHOLDER_PATTERNS = [
  /\bcoming soon\b/i,
  /\btodo\b/i,
  /\bfixme\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\bnot implemented\b/i,
  /\bunder construction\b/i,
  /\bwip\b/i,
  /\btbd\b/i,
  /\bdummy data\b/i,
  /\bmock data\b/i,
  /\bsample data\b/i,
];

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function classifyStatus(route) {
  if (route.pageErrors.length > 0) return "crash";
  if (route.placeholders.length > 0) return "unimplemented";
  if (route.apiFailures.length > 0) return "warning";
  if (route.consoleErrors.length > 2) return "warning";
  return "ok";
}

async function login(browser) {
  console.log(`\n🔐 Logging in as ${EMAIL}...`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const page = await browser.newPage();
    try {
      console.log(`   Attempt ${attempt}/3 — navigating to login page...`);
      // Use domcontentloaded for faster initial load (dev server first compile is slow)
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Wait for login form with generous timeout (dev server first compile)
      console.log("   Waiting for login form...");
      await page.waitForSelector("#email", { state: "visible", timeout: 30000 });

      console.log("   Filling credentials...");
      await page.fill("#email", EMAIL);
      await page.fill("#password", PASSWORD);

      // Click submit and wait for navigation away from /login
      console.log("   Submitting login form...");
      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 }).catch(() => {}),
        page.click('button[type="submit"]'),
      ]);

      // Wait for dashboard to settle (auth cookies + redirect)
      await page.waitForTimeout(5000);

      const currentUrl = page.url();
      if (currentUrl.includes("/login")) {
        console.log("⚠️  Still on login page — credentials may be invalid");
        await page.close();
        return null;
      }

      console.log(`✅ Login successful — redirected to: ${currentUrl}`);

      // Save auth state
      const state = await page.context().storageState();
      await page.close();
      return state;
    } catch (err) {
      console.error(`❌ Login attempt ${attempt} failed: ${err.message}`);
      await page.close();
      if (attempt < 3) {
        console.log("   Retrying in 3s...");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  return null;
}

async function auditRoute(context, route) {
  const result = {
    path: route.path,
    label: route.label,
    group: route.group,
    status: "ok",
    loadMs: 0,
    httpStatus: null,
    consoleErrors: [],
    pageErrors: [],
    apiFailures: [],
    placeholders: [],
    hasHeading: false,
    headingText: null,
    buttonCount: 0,
    tableCount: 0,
    cardCount: 0,
    linkCount: 0,
    formCount: 0,
    hasData: false,
    bodyLength: 0,
    bodySnippet: "",
    issues: [],
  };

  const page = await context.newPage();

  // Collect console messages
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Skip noisy resource loading errors
      if (!text.includes("Failed to load resource")) {
        result.consoleErrors.push(text);
      }
    }
  });

  // Collect page errors (JS exceptions)
  page.on("pageerror", (err) => {
    result.pageErrors.push(err.message);
  });

  // Collect API failures
  page.on("response", (response) => {
    const url = response.url();
    const status = response.status();
    if (url.includes("/api/") && status >= 400) {
      result.apiFailures.push(`${status} ${url.replace(BASE_URL, "")}`);
    }
  });

  const startTime = Date.now();

  try {
    const response = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    result.loadMs = Date.now() - startTime;
    result.httpStatus = response?.status() || null;

    // Wait for potential client-side data loading
    await page.waitForTimeout(3000);

    // Extract page content
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    result.bodyLength = bodyText.length;
    result.bodySnippet = bodyText.substring(0, 200).replace(/\n/g, " ");

    // Check for heading
    const heading = await page.$("h1");
    if (heading) {
      result.hasHeading = true;
      result.headingText = (await heading.textContent())?.trim() || null;
    }

    // Count interactive elements
    result.buttonCount = await page.locator("button").count();
    result.tableCount = await page.locator("table").count();
    result.cardCount = await page.locator(".card").count();
    result.linkCount = await page.locator("a").count();
    result.formCount = await page.locator("form").count();

    // Check if there's actual data (tables with rows, cards with content)
    const hasTableData = await page.locator("table tbody tr").count();
    const hasCardContent = result.cardCount > 2;
    result.hasData = hasTableData > 0 || hasCardContent;

    // Check for placeholder text
    for (const pattern of PLACEHOLDER_PATTERNS) {
      const matches = bodyText.match(new RegExp(pattern, "gi"));
      if (matches) {
        result.placeholders.push(...matches.slice(0, 3));
      }
    }

    // Screenshot — Desktop
    const slug = slugify(route.label);
    await page.setViewportState?.({ width: 1440, height: 900 }).catch(() => {});
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `desktop-${slug}.png`),
      fullPage: true,
    });

    // Screenshot — Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: join(SCREENSHOT_DIR, `mobile-${slug}.png`),
      fullPage: true,
    });

    // Build issues list
    if (result.pageErrors.length > 0) result.issues.push(`${result.pageErrors.length} JS error(s)`);
    if (result.apiFailures.length > 0) result.issues.push(`${result.apiFailures.length} API failure(s)`);
    if (result.placeholders.length > 0) result.issues.push(`Placeholder: ${[...new Set(result.placeholders)].join(", ")}`);
    if (result.loadMs > 5000) result.issues.push(`Slow load: ${(result.loadMs / 1000).toFixed(1)}s`);

    result.status = classifyStatus(result);
  } catch (err) {
    result.status = "crash";
    result.pageErrors.push(err.message);
    result.issues.push(`Navigation error: ${err.message}`);
  } finally {
    await page.close();
  }

  return result;
}

function generateMarkdown(results, loginSuccess) {
  const md = [];
  const now = new Date().toISOString();

  md.push("# 🔐 Playwright Authenticated Audit Report\n");
  md.push(`**Date:** ${now}`);
  md.push(`**Base URL:** ${BASE_URL}`);
  md.push(`**Authenticated:** ${loginSuccess ? `✅ Yes (${EMAIL})` : "❌ No"}\n`);

  // Summary
  const ok = results.filter((r) => r.status === "ok").length;
  const warnings = results.filter((r) => r.status === "warning").length;
  const crashes = results.filter((r) => r.status === "crash").length;
  const unimplemented = results.filter((r) => r.status === "unimplemented").length;
  const total = results.length;

  md.push("## 📊 Summary\n");
  md.push("| Metric | Count |");
  md.push("|---|---|");
  md.push(`| ✅ Passed (OK) | ${ok} |`);
  md.push(`| ⚠️ Warnings | ${warnings} |`);
  md.push(`| 🚧 Unimplemented | ${unimplemented} |`);
  md.push(`| 💥 Crashes | ${crashes} |`);
  md.push(`| **Total Routes** | **${total}** |`);
  const avgLoad = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.loadMs, 0) / results.length) : 0;
  md.push(`| **Avg Load Time** | ${avgLoad}ms |`);
  md.push(`| **Total Errors** | ${results.reduce((s, r) => s + r.pageErrors.length, 0)} page errors, ${results.reduce((s, r) => s + r.consoleErrors.length, 0)} console errors, ${results.reduce((s, r) => s + r.apiFailures.length, 0)} API failures |`);
  md.push("");

  // Route Status Table
  md.push("## 📄 Route Status\n");
  md.push("| Route | Status | Load (ms) | HTTP | Console Errs | API Fails | Placeholders | H1 | Data | Issues |");
  md.push("|---|---|---|---|---|---|---|---|---|---|");

  for (const r of results) {
    const statusIcon =
      r.status === "ok" ? "✅" :
      r.status === "warning" ? "⚠️" :
      r.status === "crash" ? "💥" :
      r.status === "unimplemented" ? "🚧" : "❓";
    md.push(
      `| ${statusIcon} \`${r.path}\` ${r.label} | ${r.status} | ${r.loadMs} | ${r.httpStatus || "—"} | ${r.consoleErrors.length} | ${r.apiFailures.length} | ${r.placeholders.length || 0} | ${r.headingText ? "✅" : "❌"} | ${r.hasData ? "✅" : "❌"} | ${r.issues.join("; ") || "—"} |`
    );
  }
  md.push("");

  // Detailed Findings
  md.push("## 🔍 Detailed Findings\n");

  const problemRoutes = results.filter((r) => r.status !== "ok");
  if (problemRoutes.length === 0) {
    md.push("✅ **All routes passed without issues!**\n");
  } else {
    for (const r of problemRoutes) {
      md.push(`### ${r.label} — \`${r.path}\``);
      md.push(`**Status:** \`${r.status}\` | **Load:** ${r.loadMs}ms | **HTTP:** ${r.httpStatus || "—"}\n`);

      if (r.issues.length > 0) {
        md.push("**Issues:**");
        for (const issue of r.issues) md.push(`- ${issue}`);
        md.push("");
      }

      if (r.pageErrors.length > 0) {
        md.push("**JS Errors (Page Errors):**");
        for (const err of [...new Set(r.pageErrors)].slice(0, 5)) md.push(`- \`${err}\``);
        md.push("");
      }

      if (r.consoleErrors.length > 0) {
        md.push("**Console Errors:**");
        for (const err of [...new Set(r.consoleErrors)].slice(0, 5)) md.push(`- \`${err}\``);
        md.push("");
      }

      if (r.apiFailures.length > 0) {
        md.push("**API Failures:**");
        for (const fail of [...new Set(r.apiFailures)].slice(0, 10)) md.push(`- \`${fail}\``);
        md.push("");
      }

      if (r.placeholders.length > 0) {
        md.push("**Placeholder/Dead Text:**");
        for (const p of [...new Set(r.placeholders)]) md.push(`- \`${p}\``);
        md.push("");
      }

      if (r.bodySnippet) {
        md.push(`**Content Preview:** \`${r.bodySnippet.substring(0, 150)}...\`\n`);
      }

      md.push("---\n");
    }
  }

  // Performance Analysis
  md.push("## ⏱️ Performance Analysis\n");
  const slowRoutes = results.filter((r) => r.loadMs > 3000).sort((a, b) => b.loadMs - a.loadMs);
  if (slowRoutes.length > 0) {
    md.push("**Slow Routes (>3s):**\n");
    md.push("| Route | Load Time |");
    md.push("|---|---|");
    for (const r of slowRoutes) {
      md.push(`| \`${r.path}\` ${r.label} | ${(r.loadMs / 1000).toFixed(2)}s |`);
    }
    md.push("");
  } else {
    md.push("✅ All routes loaded within 3 seconds.\n");
  }

  // Recommendations
  md.push("## 💡 Recommendations\n");

  if (crashes > 0) {
    md.push(`### 🔴 High — Crashes (${crashes})`);
    const crashed = results.filter((r) => r.status === "crash");
    for (const r of crashed) md.push(`- \`${r.path}\` — ${r.pageErrors[0] || "Unknown error"}`);
    md.push("");
  }

  if (warnings > 0) {
    md.push(`### 🟠 Medium — Warnings (${warnings})`);
    const warned = results.filter((r) => r.status === "warning");
    for (const r of warned) {
      md.push(`- \`${r.path}\` — ${r.issues.join("; ")}`);
    }
    md.push("");
  }

  if (unimplemented > 0) {
    md.push(`### 🟡 Low — Unimplemented (${unimplemented})`);
    const unimpl = results.filter((r) => r.status === "unimplemented");
    for (const r of unimpl) md.push(`- \`${r.path}\` — Placeholder: ${r.placeholders.join(", ")}`);
    md.push("");
  }

  if (slowRoutes.length > 0) {
    md.push("### ⏱️ Performance — Slow Routes");
    md.push("- Consider optimizing API calls and database queries");
    md.push("- Reduce waterfall requests (batch parallel calls)");
    md.push("- Add caching for frequently accessed data\n");
  }

  return md.join("\n");
}

// ── Main ──
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  🔐  Playwright Authenticated Audit — Starting...");
  console.log("═══════════════════════════════════════════════════════════\n");

  const browser = await chromium.launch({ headless: true });

  // Step 1: Login
  const authState = await login(browser);
  const loginSuccess = authState !== null;

  if (!loginSuccess) {
    console.log("\n⚠️  Login failed — running audit as anonymous user");
    console.log("   (Routes will likely redirect to login page)");
  }

  // Step 2: Create authenticated context
  const context = await browser.newContext({
    storageState: loginSuccess ? authState : undefined,
    viewport: { width: 1440, height: 900 },
  });

  // Step 3: Audit all routes
  const results = [];
  for (let i = 0; i < ROUTES.length; i++) {
    const route = ROUTES[i];
    console.log(`[${i + 1}/${ROUTES.length}] Auditing ${route.label} (${route.path})...`);

    const result = await auditRoute(context, route);
    results.push(result);

    const icon =
      result.status === "ok" ? "✅" :
      result.status === "warning" ? "⚠️ " :
      result.status === "crash" ? "💥" :
      result.status === "unimplemented" ? "🚧" : "❓";
    console.log(`  ${icon} ${result.status} — ${result.loadMs}ms — ${result.issues.length} issue(s)`);
  }

  await context.close();
  await browser.close();

  // Step 4: Generate reports
  console.log("\n📝 Generating reports...");

  const md = generateMarkdown(results, loginSuccess);
  writeFileSync("AUDIT-AUTH-REPORT.md", md);

  const json = JSON.stringify({
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    authenticated: loginSuccess,
    email: EMAIL,
    totalRoutes: results.length,
    summary: {
      ok: results.filter((r) => r.status === "ok").length,
      warning: results.filter((r) => r.status === "warning").length,
      crash: results.filter((r) => r.status === "crash").length,
      unimplemented: results.filter((r) => r.status === "unimplemented").length,
    },
    routes: results,
  }, null, 2);
  writeFileSync(join(SCREENSHOT_DIR, "audit-auth-report.json"), json);

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  📊 AUDIT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════\n");

  const ok = results.filter((r) => r.status === "ok").length;
  const warnings = results.filter((r) => r.status === "warning").length;
  const crashes = results.filter((r) => r.status === "crash").length;
  const unimplemented = results.filter((r) => r.status === "unimplemented").length;

  console.log(`  ✅ Passed:        ${ok}`);
  console.log(`  ⚠️  Warnings:      ${warnings}`);
  console.log(`  💥 Crashes:       ${crashes}`);
  console.log(`  🚧 Unimplemented: ${unimplemented}`);
  console.log(`  📄 Total Routes:  ${results.length}`);
  console.log(`  🔐 Authenticated: ${loginSuccess ? "✅" : "❌"}\n`);

  console.log("📁 MD Report:    AUDIT-AUTH-REPORT.md");
  console.log("📁 JSON Report:  scripts/screenshots/audit-auth/audit-auth-report.json");
  console.log("📁 Screenshots:  scripts/screenshots/audit-auth/");

  process.exit(crashes > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});