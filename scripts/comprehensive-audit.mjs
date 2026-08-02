import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "audit");
const REPORT_PATH = path.join(process.cwd(), "scripts", "audit-report.json");

// Ensure directories exist
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Pages to audit
const PAGES = [
  { name: "Dashboard", path: "/", category: "main" },
  { name: "Tasks", path: "/tasks", category: "main" },
  { name: "Clients", path: "/clients", category: "main" },
  { name: "Ads Spend", path: "/ads-spend", category: "main" },
  { name: "Weekly Report", path: "/reports", category: "main" },
  { name: "Strategy (OKR)", path: "/strategy", category: "main" },
  { name: "Creative Requests", path: "/creative", category: "main" },
  { name: "Content Plans", path: "/content-plans", category: "main" },
  { name: "Calendar", path: "/calendar", category: "main" },
  { name: "Timesheet", path: "/timesheet", category: "main" },
  { name: "Invoices", path: "/invoices", category: "main" },
  { name: "User Management", path: "/users", category: "main" },
  { name: "Settings", path: "/settings", category: "settings" },
  { name: "Settings - Profile", path: "/settings/profile", category: "settings" },
  { name: "Settings - Preferences", path: "/settings/preferences", category: "settings" },
  { name: "Settings - Security", path: "/settings/security", category: "settings" },
  { name: "Settings - Workspace", path: "/settings/workspace", category: "settings" },
];

// ════════════════════════════════════════════
// HELPER: Sanitize filename
// ════════════════════════════════════════════
function sanitize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ════════════════════════════════════════════
// MAIN AUDIT FUNCTION
// ════════════════════════════════════════════
async function runAudit() {
  console.log("🚀 Starting Comprehensive Dashboard Audit...\n");

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalPages: PAGES.length,
    loginStatus: "unknown",
    pages: [],
    summary: {
      critical: 0,
      warnings: 0,
      passed: 0,
    },
  };

  const browser = await chromium.launch({ headless: true });

  // ════ LOGIN (Desktop context) ════
  console.log("📝 Logging in as admin@hadona.id...");
  const desktopContext = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: "id-ID",
  });

  const loginPage = await desktopContext.newPage();

  // Collect console errors during login
  const loginConsoleErrors = [];
  loginPage.on("console", (msg) => {
    if (msg.type() === "error") {
      loginConsoleErrors.push({ text: msg.text(), url: loginPage.url() });
    }
  });

  try {
    await loginPage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await loginPage.waitForSelector('input[type="email"]', { timeout: 10000 });
    await loginPage.fill('input[type="email"]', EMAIL);
    await loginPage.fill('input[type="password"]', PASSWORD);
    await loginPage.click('button[type="submit"]');

    // Wait for redirect away from /login
    await loginPage.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
    await loginPage.waitForTimeout(3000);

    const currentUrl = loginPage.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/waiting") || currentUrl.includes("/rejected")) {
      report.loginStatus = `FAILED — redirected to ${currentUrl}`;
      console.log(`  ❌ Login failed: redirected to ${currentUrl}\n`);
    } else {
      report.loginStatus = "SUCCESS";
      console.log(`  ✅ Login success. URL: ${currentUrl}\n`);
    }
  } catch (err) {
    report.loginStatus = `ERROR: ${err.message}`;
    console.log(`  ❌ Login error: ${err.message}\n`);
  }

  // If login failed, try alternative: set session directly
  if (report.loginStatus !== "SUCCESS") {
    console.log("⚠️ Login via form failed. Trying Supabase session restore...");
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        "https://rsxqjjcuixdsmijhgdyl.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzeHFqamN1aXhkc21pamhnZHlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMDU4MDgsImV4cCI6MjEwMDg4MTgwOH0.Onekq4zkmIBNqze-fhLG189FVedYvQAcxYwulp90R0U"
      );
      const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
      if (error) throw error;

      // Set cookies
      const cookies = await loginPage.context().cookies();
      const sessionStr = JSON.stringify(data.session);
      await desktopContext.addCookies([
        {
          name: "sb-access-token",
          value: data.session.access_token,
          domain: "workspace.hadona.id",
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]);

      // Also set the cookie that @supabase/ssr expects
      const supabaseCookieName = `sb-rsxqjjcuixdsmijhgdyl-auth-token`;
      await desktopContext.addCookies([
        {
          name: supabaseCookieName,
          value: JSON.stringify(data.session),
          domain: "workspace.hadona.id",
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        },
      ]);

      await loginPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 30000 });
      await loginPage.waitForTimeout(3000);

      const url = loginPage.url();
      if (!url.includes("/login")) {
        report.loginStatus = "SUCCESS (via session cookie)";
        console.log(`  ✅ Session restore success. URL: ${url}\n`);
      } else {
        report.loginStatus = "FAILED — session restore did not work";
        console.log(`  ❌ Session restore failed\n`);
      }
    } catch (err2) {
      report.loginStatus = `FAILED ALL METHODS: ${err2.message}`;
      console.log(`  ❌ Session restore also failed: ${err2.message}\n`);
    }
  }

  // ════ AUDIT EACH PAGE (Desktop) ════
  console.log("══════════════════════════════════════");
  console.log("🖥️  DESKTOP AUDIT (1920×1080)");
  console.log("══════════════════════════════════════\n");

  for (const pageInfo of PAGES) {
    const result = await auditPage(loginPage, pageInfo, "desktop", desktopContext);
    report.pages.push(result);

    const status = result.criticalIssues > 0 ? "🔴" : result.warnings > 0 ? "🟡" : "🟢";
    console.log(`${status} ${pageInfo.name.padEnd(25)} ${result.criticalIssues > 0 ? `${result.criticalIssues} critical` : result.warnings > 0 ? `${result.warnings} warnings` : "OK"}`);

    if (result.criticalIssues > 0) report.summary.critical += result.criticalIssues;
    if (result.warnings > 0) report.summary.warnings += result.warnings;
    if (result.criticalIssues === 0 && result.warnings === 0) report.summary.passed++;
  }

  // ════ MOBILE AUDIT ════
  console.log("\n══════════════════════════════════════");
  console.log("📱 MOBILE AUDIT (iPhone 14 — 390×844)");
  console.log("══════════════════════════════════════\n");

  // Get cookies from desktop session
  const cookies = await desktopContext.cookies();
  const localStorage = await loginPage.evaluate(() => JSON.stringify(window.localStorage));

  const mobileContext = await browser.newContext({
    ...devices["iPhone 14"],
    viewport: { width: 390, height: 844 },
    locale: "id-ID",
  });

  // Transfer cookies
  await mobileContext.addCookies(cookies);

  const mobilePage = await mobileContext.newPage();

  // Transfer localStorage
  await mobilePage.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await mobilePage.evaluate((ls) => {
    try {
      const parsed = JSON.parse(ls);
      for (const [key, value] of Object.entries(parsed)) {
        localStorage.setItem(key, value);
      }
    } catch {}
  }, localStorage);

  for (const pageInfo of PAGES) {
    const result = await auditPage(mobilePage, pageInfo, "mobile", mobileContext);
    // Merge mobile results into existing page report
    const existing = report.pages.find((p) => p.name === pageInfo.name);
    if (existing) {
      existing.mobile = result;
      if (result.criticalIssues > 0) report.summary.critical += result.criticalIssues;
      if (result.warnings > 0) report.summary.warnings += result.warnings;
    }

    const status = result.criticalIssues > 0 ? "🔴" : result.warnings > 0 ? "🟡" : "🟢";
    console.log(`${status} ${pageInfo.name.padEnd(25)} ${result.criticalIssues > 0 ? `${result.criticalIssues} critical` : result.warnings > 0 ? `${result.warnings} warnings` : "OK"}`);
  }

  // ════ SAVE REPORT ════
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved: scripts/audit-report.json`);
  console.log(`📸 Screenshots: scripts/screenshots/audit/`);

  // ════ PRINT SUMMARY ════
  console.log("\n" + "═".repeat(60));
  console.log("📊 AUDIT SUMMARY");
  console.log("═".repeat(60));
  console.log(`Login: ${report.loginStatus}`);
  console.log(`Pages tested: ${report.totalPages}`);
  console.log(`🟢 Passed: ${report.summary.passed}/${report.totalPages}`);
  console.log(`🟡 Warnings: ${report.summary.warnings}`);
  console.log(`🔴 Critical: ${report.summary.critical}`);
  console.log("═".repeat(60));

  await browser.close();
  return report;
}

// ════════════════════════════════════════════
// AUDIT SINGLE PAGE
// ════════════════════════════════════════════
async function auditPage(page, pageInfo, device, context) {
  const result = {
    name: pageInfo.name,
    path: pageInfo.path,
    device,
    criticalIssues: 0,
    warnings: 0,
    details: [],
    consoleErrors: [],
    networkErrors: [],
    layoutIssues: [],
    performance: {},
    screenshot: "",
  };

  const fileName = `${device}-${sanitize(pageInfo.name)}`;
  const consoleErrors = [];
  const networkErrors = [];
  const requestUrls = [];

  // Listen to console
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Filter out noisy errors
      if (!text.includes("favicon") && !text.includes("manifest")) {
        consoleErrors.push(text.substring(0, 300));
      }
    }
  });

  // Listen to network failures
  page.on("response", (response) => {
    if (response.status() >= 400) {
      networkErrors.push({
        url: response.url().substring(0, 200),
        status: response.status(),
      });
    }
  });

  try {
    const startTime = Date.now();

    await page.goto(`${BASE_URL}${pageInfo.path}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Wait for content to render
    await page.waitForTimeout(3000);

    const loadTime = Date.now() - startTime;
    result.performance.loadTimeMs = loadTime;

    // ── Check 1: Page redirected to login/error? ──
    const currentUrl = page.url();
    if (currentUrl.includes("/login") || currentUrl.includes("/waiting") || currentUrl.includes("/rejected")) {
      result.criticalIssues++;
      result.details.push(`🔴 Page redirected to ${currentUrl} — auth or access issue`);
    }

    // ── Check 2: Error boundary visible? ──
    const errorBoundary = await page.locator("text=/Something went wrong/i").count();
    if (errorBoundary > 0) {
      result.criticalIssues++;
      result.details.push("🔴 Error boundary visible — page crashed");
    }

    // ── Check 3: Empty page (no content)? ──
    const bodyText = await page.evaluate(() => document.body?.innerText?.trim()?.length || 0);
    if (bodyText < 100) {
      result.criticalIssues++;
      result.details.push(`🔴 Page appears empty (body text: ${bodyText} chars)`);
    }

    // ── Check 4: Horizontal scroll (overflow) ──
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
    });
    if (hasHorizontalScroll) {
      result.warnings++;
      result.layoutIssues.push("horizontal-overflow");
      result.details.push("🟡 Horizontal scroll detected — content wider than viewport");
    }

    // ── Check 5: Elements overflowing viewport ──
    const overflowInfo = await page.evaluate((device) => {
      const issues = [];
      const vw = window.innerWidth;

      // Check for fixed elements wider than viewport
      const fixedElements = document.querySelectorAll(".fixed, .sticky");
      fixedElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > vw + 2) {
          issues.push({
            type: "fixed-overflow",
            tag: el.tagName,
            className: el.className?.substring?.(0, 80),
            right: rect.right,
            viewport: vw,
          });
        }
      });

      // Check for tables that might overflow
      const tables = document.querySelectorAll("table");
      tables.forEach((table) => {
        const rect = table.getBoundingClientRect();
        if (rect.right > vw + 2) {
          issues.push({
            type: "table-overflow",
            right: rect.right,
            viewport: vw,
          });
        }
      });

      // Check for cards/buttons that might be too wide
      const cards = document.querySelectorAll(".card, [class*='overflow-visible']");
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (rect.right > vw + 2) {
          issues.push({
            type: "card-overflow",
            className: card.className?.substring?.(0, 60),
            right: rect.right,
          });
        }
      });

      // Check sidebar visible on mobile (should be hidden)
      if (device === "mobile") {
        const sidebar = document.querySelector("aside");
        if (sidebar) {
          const rect = sidebar.getBoundingClientRect();
          // On mobile, sidebar should be off-screen (negative translateX)
          const style = window.getComputedStyle(sidebar);
          const transform = style.transform;
          const isOffScreen = rect.x < -100 || transform.includes("matrix(1, 0, 0, 1, -");
          if (!isOffScreen && rect.width > 50) {
            issues.push({
              type: "sidebar-visible-on-mobile",
              sidebarX: rect.x,
              sidebarWidth: rect.width,
            });
          }
        }
      }

      return issues;
    }, device);

    if (overflowInfo.length > 0) {
      result.warnings += overflowInfo.length;
      overflowInfo.forEach((issue) => {
        result.layoutIssues.push(issue.type);
        result.details.push(`🟡 Overflow: ${JSON.stringify(issue).substring(0, 120)}`);
      });
    }

    // ── Check 6: Z-index conflicts ──
    const zIndexIssues = await page.evaluate(() => {
      const issues = [];
      // Check if any element covers the sidebar
      const sidebar = document.querySelector("aside");
      if (sidebar) {
        const sidebarRect = sidebar.getBoundingClientRect();
        const sidebarZ = parseInt(window.getComputedStyle(sidebar).zIndex) || 0;

        // Check elements with higher z-index that overlap sidebar
        const allElements = document.querySelectorAll("*");
        for (const el of allElements) {
          const z = parseInt(window.getComputedStyle(el).zIndex);
          if (z > sidebarZ && z < 100) {
            const rect = el.getBoundingClientRect();
            if (rect.left < sidebarRect.right && rect.top < sidebarRect.bottom) {
              issues.push({
                tag: el.tagName,
                className: el.className?.substring?.(0, 50),
                zIndex: z,
              });
              break; // Only report first conflict
            }
          }
        }
      }
      return issues;
    });

    if (zIndexIssues.length > 0) {
      result.warnings++;
      result.details.push(`🟡 Potential z-index conflict: ${JSON.stringify(zIndexIssues[0]).substring(0, 100)}`);
    }

    // ── Check 7: Missing key elements ──
    const elementChecks = await page.evaluate((path) => {
      const issues = [];

      // Every page should have a header
      const header = document.querySelector("header, [class*='header']");
      if (!header) issues.push("missing-header");

      // Check for skeleton/loading stuck (3+ seconds still loading)
      const skeleton = document.querySelector(".skeleton, .animate-pulse");
      if (skeleton) issues.push("loading-stuck");

      // Check for buttons with no text/icon (accessibility)
      const emptyButtons = document.querySelectorAll("button:empty");
      if (emptyButtons.length > 0) issues.push(`empty-buttons-${emptyButtons.length}`);

      // Check for images with no alt text
      const images = document.querySelectorAll("img:not([alt])");
      if (images.length > 0) issues.push(`images-no-alt-${images.length}`);

      return issues;
    }, pageInfo.path);

    elementChecks.forEach((check) => {
      result.warnings++;
      result.details.push(`🟡 ${check}`);
    });

    // ── Check 8: Performance — large images ──
    const imagePerf = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs
        .filter((img) => img.naturalWidth > 0)
        .map((img) => ({
          src: img.src.substring(0, 100),
          naturalWidth: img.naturalWidth,
          displayWidth: img.getBoundingClientRect().width,
          oversized: img.naturalWidth > img.getBoundingClientRect().width * 3,
        }))
        .filter((img) => img.oversized);
    });

    if (imagePerf.length > 0) {
      result.warnings++;
      result.details.push(`🟡 ${imagePerf.length} oversized image(s) — bad performance`);
    }

    // ── Console errors ──
    if (consoleErrors.length > 0) {
      const realErrors = consoleErrors.filter(
        (e) => !e.includes("Download the React DevTools") && !e.includes("[DEPRECATED]")
      );
      if (realErrors.length > 0) {
        result.consoleErrors = realErrors.slice(0, 5);
        result.warnings += realErrors.length > 3 ? 1 : 0;
        result.details.push(`🟡 ${realErrors.length} console error(s)`);
      }
    }

    // ── Network errors ──
    const realNetworkErrors = networkErrors.filter((n) => !n.url.includes("favicon") && !n.url.includes(".map"));
    if (realNetworkErrors.length > 0) {
      result.networkErrors = realNetworkErrors.slice(0, 5);
      result.criticalIssues += realNetworkErrors.length > 2 ? 1 : 0;
      result.details.push(`🔴 ${realNetworkErrors.length} network error(s) (4xx/5xx)`);
    }

    // ── Take screenshot ──
    result.screenshot = `${fileName}.png`;
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, `${fileName}.png`),
      fullPage: false,
    });

    // ── Mobile-specific: check modal/modal triggers ──
    if (device === "mobile") {
      // Check if hamburger menu exists
      const hamburger = await page.locator('button:has(svg)', { hasText: "" }).count();
      const menuButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const menuBtn = buttons.find((btn) => {
          const svg = btn.querySelector("svg");
          return svg && btn.closest("header") && btn.getBoundingClientRect().width < 50;
        });
        return menuBtn ? "found" : "not-found";
      });

      if (menuButton === "not-found") {
        result.warnings++;
        result.details.push("🟡 Mobile menu button not found — can't open sidebar?");
      }
    }

    // ── Check 9: Long load time ──
    if (loadTime > 10000) {
      result.warnings++;
      result.details.push(`🟡 Slow load time: ${(loadTime / 1000).toFixed(1)}s`);
    }

    // ── Check 10: No data / empty state ──
    const emptyState = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      // Check if page shows "no data" type messages but doesn't have proper empty state UI
      if (text.includes("no data") || text.includes("tidak ada") || text.includes("empty")) {
        const emptyCard = document.querySelector("[class*='empty'], [class*='no-data']");
        return emptyCard ? "proper-empty-state" : "raw-text-only";
      }
      return "has-data";
    });

    if (emptyState === "raw-text-only") {
      result.warnings++;
      result.details.push("🟡 Shows 'no data' text but missing proper empty state component");
    }

    // ── Device-specific checks ──
    if (device === "desktop") {
      result.details.push(`ℹ️ Load time: ${(loadTime / 1000).toFixed(1)}s`);
    }
  } catch (err) {
    result.criticalIssues++;
    result.details.push(`🔴 Navigation error: ${err.message.substring(0, 150)}`);

    // Take error screenshot
    try {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${fileName}-ERROR.png`),
        fullPage: false,
      });
    } catch {}
  }

  return result;
}

// ════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════
runAudit()
  .then((report) => {
    process.exit(report.summary.critical > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });