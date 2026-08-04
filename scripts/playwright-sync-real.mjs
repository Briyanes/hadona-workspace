/**
 * 🎭 Playwright REAL Sync Test — Weekly Reports
 * ============================================================================
 * Test end-to-end: klik Sync Now → tangkap response → verify data muncul.
 *
 * Berbeda dari playwright-reports-audit.mjs (yang dismiss dialog):
 *   - Script ini BENAR-BENAR klik OK pada confirm dialog
 *   - Capture network response POST /api/reports/sync
 *   - Count cards before vs after
 *   - Verify organic reports (yang sebelumnya ter-skip) masuk
 *
 * Usage:
 *   BASE_URL=https://workspace.hadona.id \
 *   TEST_LOGIN_EMAIL=xxx \
 *   TEST_LOGIN_PASSWORD=xxx \
 *   node scripts/playwright-sync-real.mjs
 *
 * Output:
 *   - scripts/screenshots/sync-real/*.png
 *   - scripts/screenshots/sync-real/sync-result.json
 * ============================================================================
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const REPORTS_PAGE = `${BASE_URL}/reports`;
const LOGIN_PAGE = `${BASE_URL}/login`;

const TEST_EMAIL = process.env.TEST_LOGIN_EMAIL;
const TEST_PASSWORD = process.env.TEST_LOGIN_PASSWORD;

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error("❌ TEST_LOGIN_EMAIL dan TEST_LOGIN_PASSWORD wajib di-set");
  console.error("   Contoh:");
  console.error(
    "   TEST_LOGIN_EMAIL=admin@hadona.id TEST_LOGIN_PASSWORD=xxx node scripts/playwright-sync-real.mjs"
  );
  process.exit(1);
}

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "sync-real");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  preSync: null,
  syncResponse: null,
  postSync: null,
  diagnosis: null,
  errors: [],
  screenshots: [],
};

function screenshot(page, name) {
  const filename = `${name}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  report.screenshots.push(filename);
  return page.screenshot({ path: filepath, fullPage: true });
}

async function fetchReports(page) {
  // Pakai page.evaluate supaya cookies auth ikut
  return await page.evaluate(async () => {
    const res = await fetch("/api/reports");
    if (!res.ok) return { status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { status: 200, data };
  });
}

async function login(page) {
  console.log("━".repeat(60));
  console.log("🔐 Step 1: Login");
  console.log("━".repeat(60));

  await page.goto(LOGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 20000 });
  await sleep(2500);
  await screenshot(page, "01-login-page");

  const emailInput = await page.$('input[type="email"], input[name="email"]');
  const pwInput = await page.$('input[type="password"], input[name="password"]');

  if (!emailInput || !pwInput) {
    throw new Error("Login form tidak ditemukan. Mungkin hanya OAuth Google.");
  }

  await emailInput.fill(TEST_EMAIL);
  await pwInput.fill(TEST_PASSWORD);
  await sleep(300);
  await screenshot(page, "02-login-filled");

  const submitBtn = await page.$(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("Login")'
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
  await screenshot(page, "03-after-login");

  if (url.includes("/login") || url.includes("/auth")) {
    throw new Error(`Login gagal — masih di ${url}. Cek email/password.`);
  }

  console.log(`✅ Login sukses → ${url}\n`);
  return true;
}

async function capturePreSyncState(page) {
  console.log("━".repeat(60));
  console.log("📊 Step 2: Capture Pre-Sync State");
  console.log("━".repeat(60));

  await page.goto(REPORTS_PAGE, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(4000);
  await screenshot(page, "04-reports-pre-sync");

  // Stats cards
  const statsText = await page.textContent("body").catch(() => "");

  // Report cards count
  const reportCards = await page.$$(
    ".grid.gap-4 > .card, [class*='grid'] > [class*='card']"
  );

  // GET /api/reports untuk lihat raw data
  const apiRes = await fetchReports(page);

  // Cek "Tidak ada data" empty state
  const isEmpty = statsText.toLowerCase().includes("tidak ada") ||
    statsText.toLowerCase().includes("belum ada") ||
    statsText.toLowerCase().includes("no report");

  const preSync = {
    url: page.url(),
    reportCardsCount: reportCards.length,
    isEmptyState: isEmpty,
    apiStatus: apiRes.status,
    apiReportsCount: Array.isArray(apiRes.data?.reports) ? apiRes.data.reports.length : 0,
    apiFirstReport: apiRes.data?.reports?.[0] || null,
    bodyTextSnippet: statsText.slice(0, 500),
  };

  report.preSync = preSync;
  console.log(`   URL:                  ${preSync.url}`);
  console.log(`   Report cards di DOM:  ${preSync.reportCardsCount}`);
  console.log(`   Empty state:          ${preSync.isEmptyState}`);
  console.log(`   API /reports status:  ${preSync.apiStatus}`);
  console.log(`   API reports count:    ${preSync.apiReportsCount}`);
  console.log(
    `   API first report:     ${
      preSync.apiFirstReport
        ? `${preSync.apiFirstReport.client_name || "?"} (${preSync.apiFirstReport.period_start})`
        : "(kosong)"
    }\n`
  );

  return preSync;
}

async function triggerSync(page) {
  console.log("━".repeat(60));
  console.log("🔄 Step 3: Trigger REAL Sync");
  console.log("━".repeat(60));

  // Setup network listener untuk capture sync response
  const syncResponsePromise = new Promise((resolve) => {
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/api/reports/sync") && response.request().method() === "POST") {
        try {
          const status = response.status();
          const body = await response.json().catch(() => null);
          resolve({ status, body });
        } catch (e) {
          resolve({ status: response.status(), body: null, error: e.message });
        }
      }
    });
  });

  // Cari Sync Now button
  const syncBtn = await page.$('button:has-text("Sync Now")');
  if (!syncBtn) {
    throw new Error("Sync Now button tidak ditemukan. Mungkin role Anda tidak diizinkan.");
  }

  console.log("   ✓ Sync Now button ditemukan, clicking...");

  // Click + accept dialog (bukan dismiss!)
  page.once("dialog", async (dialog) => {
    console.log(`   📝 Dialog: "${dialog.message().slice(0, 100)}..."`);
    await dialog.accept().catch(() => {});
  });

  await syncBtn.click();

  // Tunggu sync selesai (timeout 90 detik karena sync bisa lama)
  console.log("   ⏳ Menunggu sync selesai (max 90s)...");
  await screenshot(page, "05-sync-loading");

  let syncResult = null;
  try {
    syncResult = await Promise.race([
      syncResponsePromise,
      sleep(90000).then(() => ({ status: 0, body: null, error: "Timeout 90s" })),
    ]);
  } catch (e) {
    syncResult = { status: 0, body: null, error: e.message };
  }

  console.log(`   📡 API response status: ${syncResult.status}`);
  if (syncResult.body) {
    const s = syncResult.body.summary || syncResult.body;
    console.log(`   📊 imported: ${s.imported}, updated: ${s.updated}, skipped: ${s.skipped}, errors: ${s.errors}`);
    if (s.skippedBreakdown) {
      console.log(`   🔍 skipped breakdown:`);
      console.log(`      • noMetrics:        ${s.skippedBreakdown.noMetrics}`);
      console.log(`      • noClient:         ${s.skippedBreakdown.noClient}`);
      console.log(`      • noPeriod:         ${s.skippedBreakdown.noPeriod}`);
      console.log(`      • dedup:            ${s.skippedBreakdown.dedup}`);
      console.log(`      • unmatchedClient:  ${s.skippedBreakdown.unmatchedClient}`);
    }
    if (syncResult.body.error) {
      console.log(`   ❌ Error: ${syncResult.body.error}`);
    }
  } else if (syncResult.error) {
    console.log(`   ❌ ${syncResult.error}`);
  }

  report.syncResponse = syncResult;
  await sleep(3000);
  await screenshot(page, "06-sync-result-modal");
  console.log("");
  return syncResult;
}

async function capturePostSyncState(page) {
  console.log("━".repeat(60));
  console.log("📊 Step 4: Capture Post-Sync State");
  console.log("━".repeat(60));

  // Refresh page untuk reload data
  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await sleep(5000);
  await screenshot(page, "07-reports-post-sync");

  const statsText = await page.textContent("body").catch(() => "");
  const reportCards = await page.$$(
    ".grid.gap-4 > .card, [class*='grid'] > [class*='card']"
  );

  const apiRes = await fetchReports(page);

  const isEmpty =
    statsText.toLowerCase().includes("tidak ada") ||
    statsText.toLowerCase().includes("belum ada");

  const postSync = {
    url: page.url(),
    reportCardsCount: reportCards.length,
    isEmptyState: isEmpty,
    apiStatus: apiRes.status,
    apiReportsCount: Array.isArray(apiRes.data?.reports) ? apiRes.data.reports.length : 0,
    apiFirstReport: apiRes.data?.reports?.[0] || null,
    apiSampleClients: Array.isArray(apiRes.data?.reports)
      ? [...new Set(apiRes.data.reports.map((r) => r.client_name).filter(Boolean))]
          .slice(0, 10)
      : [],
  };

  report.postSync = postSync;
  console.log(`   URL:                  ${postSync.url}`);
  console.log(`   Report cards di DOM:  ${postSync.reportCardsCount}`);
  console.log(`   Empty state:          ${postSync.isEmptyState}`);
  console.log(`   API /reports status:  ${postSync.apiStatus}`);
  console.log(`   API reports count:    ${postSync.apiReportsCount}`);
  console.log(`   API sample clients:   ${postSync.apiSampleClients.join(", ")}\n`);
  return postSync;
}

function diagnose() {
  console.log("━".repeat(60));
  console.log("🩺 Step 5: Diagnosis");
  console.log("━".repeat(60));

  const d = {
    loginOk: !!report.preSync && !report.preSync.url.includes("/login"),
    syncApiCalled: !!report.syncResponse,
    syncApiOk: report.syncResponse?.status === 200 && report.syncResponse?.body?.success !== false,
    syncApiError: report.syncResponse?.body?.error || null,
    reportsIncreased:
      report.preSync && report.postSync && report.postSync.apiReportsCount > report.preSync.apiReportsCount,
    cardsRendered: report.postSync?.reportCardsCount > 0,
    hasEmptyState: report.postSync?.isEmptyState,
    apiReturnsData: report.postSync?.apiReportsCount > 0,
  };

  const issues = [];
  if (!d.loginOk) issues.push("Login gagal — tidak bisa test lebih lanjut");
  if (d.syncApiCalled && !d.syncApiOk) {
    issues.push(
      `Sync API return error: ${d.syncApiError || `status ${report.syncResponse.status}`}`
    );
  }
  if (!d.syncApiCalled) issues.push("Sync API tidak terpanggil — button mungkin gagal click atau dialog tidak muncul");
  if (d.syncApiOk && !d.reportsIncreased && report.preSync?.apiReportsCount === 0) {
    issues.push("Sync sukses tapi API /reports masih kosong (kemungkinan filter client_id/period atau RLS issue)");
  }
  if (d.apiReturnsData && !d.cardsRendered) {
    issues.push("API return data tapi cards tidak render (kemungkinan bug di frontend page.tsx)");
  }
  if (d.hasEmptyState && d.apiReturnsData) {
    issues.push("Empty state muncul padahal API punya data (frontend tidak fetch atau filter salah)");
  }

  d.issues = issues;
  d.verdict =
    issues.length === 0
      ? "✅ SEMUA OK — sync berhasil, data muncul"
      : `⚠️ DITEMUKAN ${issues.length} ISSUE`;

  report.diagnosis = d;

  console.log(`   Login OK:             ${d.loginOk ? "✅" : "❌"}`);
  console.log(`   Sync API called:      ${d.syncApiCalled ? "✅" : "❌"}`);
  console.log(`   Sync API success:     ${d.syncApiOk ? "✅" : "❌"}`);
  console.log(`   Reports increased:    ${d.reportsIncreased ? "✅" : "❌"}`);
  console.log(`   Cards rendered:       ${d.cardsRendered ? "✅" : "❌"}`);
  console.log(`   Empty state shown:    ${d.hasEmptyState ? "❌" : "✅"}`);
  console.log(`   API returns data:     ${d.apiReturnsData ? "✅" : "❌"}`);
  console.log("");
  console.log(`   ${d.verdict}`);
  if (issues.length > 0) {
    console.log("\n   Issues:");
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  }
  console.log("");

  return d;
}

async function run() {
  console.log("═".repeat(60));
  console.log("  🎭 Playwright REAL Sync Test — Weekly Reports");
  console.log("═".repeat(60));
  console.log(`  Target:    ${BASE_URL}`);
  console.log(`  Email:     ${TEST_EMAIL}`);
  console.log(`  Output:    ${SCREENSHOT_DIR}`);
  console.log("═".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: true });

  // Capture console errors
  const consoleErrors = [];
  const pageErrors = [];
  const networkErrors = [];

  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("requestfailed", (req) => {
    if (!req.url().includes("sentry") && !req.url().includes("favicon")) {
      networkErrors.push({ url: req.url(), error: req.failure()?.errorText });
    }
  });

  try {
    await login(page);
    await capturePreSyncState(page);
    await triggerSync(page);
    await capturePostSyncState(page);
    diagnose();
  } catch (e) {
    console.error(`\n❌ FATAL: ${e.message}`);
    report.errors.push(e.message);
    await screenshot(page, "99-fatal-error").catch(() => {});
  }

  // Console errors summary
  console.log("━".repeat(60));
  console.log("🐛 Console Errors & Network Issues");
  console.log("━".repeat(60));
  console.log(`   Console errors:    ${consoleErrors.length}`);
  console.log(`   Page errors:       ${pageErrors.length}`);
  console.log(`   Network failures:  ${networkErrors.length}`);
  consoleErrors.slice(0, 5).forEach((e) => console.log(`   • ${e.slice(0, 200)}`));
  pageErrors.slice(0, 3).forEach((e) => console.log(`   • ${e.slice(0, 200)}`));
  networkErrors.slice(0, 3).forEach((n) => console.log(`   • ${n.url.slice(0, 100)}: ${n.error}`));

  report.consoleErrors = consoleErrors;
  report.pageErrors = pageErrors;
  report.networkErrors = networkErrors;
  report.finishedAt = new Date().toISOString();

  // Save report
  const reportPath = path.join(SCREENSHOT_DIR, "sync-result.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n" + "═".repeat(60));
  console.log(`📁 Report JSON:    ${reportPath}`);
  console.log(`📁 Screenshots:    ${SCREENSHOT_DIR}`);
  console.log("═".repeat(60));

  await ctx.close();
  await browser.close();

  // Exit code: 0 kalau sukses, 1 kalau ada issue
  process.exit(report.diagnosis?.issues?.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});