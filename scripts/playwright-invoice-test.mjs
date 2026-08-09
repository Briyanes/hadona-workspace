/**
 * Playwright Test — Invoice PDF Generation
 *
 * Tests the full flow:
 * 1. Login via Supabase auth API
 * 2. Navigate to /invoices
 * 3. Screenshot invoice list
 * 4. Test PDF download via API
 *
 * Usage: node scripts/playwright-invoice-test.mjs
 * Env: TEST_EMAIL, TEST_PASSWORD (or defaults)
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "https://workspace.hadona.id";
const TEST_EMAIL = process.env.TEST_EMAIL || "admin@hadona.id";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "@Yogyakarta2026";

const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "invoice-test");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function log(type, msg, detail = "") {
  const icons = { INFO: "ℹ️", PASS: "✅", FAIL: "❌", WARN: "⚠️", STEP: "▶️" };
  console.log(`${icons[type] || "•"} [${type}] ${msg}${detail ? " — " + detail : ""}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("━".repeat(60));
  console.log("  🎭 Playwright Invoice PDF Test");
  console.log("━".repeat(60));
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Email:  ${TEST_EMAIL}`);
  console.log("━".repeat(60) + "\n");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // Capture console
  const consoleLogs = [];
  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // ════════════════════════════════════════
  // STEP 1: Login
  // ════════════════════════════════════════
  log("STEP", "Login ke workspace...");
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 20000 });

    // Fill email
    await page.fill('input[type="email"]', TEST_EMAIL);
    // Fill password
    await page.fill('input[type="password"]', TEST_PASSWORD);
    // Click submit
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL("**/", { timeout: 15000 }).catch(() => {});
    await sleep(3000);

    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      log("FAIL", "Login gagal", `Still on: ${currentUrl}`);
      console.log("\n  Console logs:", consoleLogs.slice(-5).join("\n  "));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "login-failed.png"), fullPage: true });
      await browser.close();
      return;
    }

    log("PASS", "Login berhasil", currentUrl);
  } catch (err) {
    log("FAIL", "Login error", err.message);
    await browser.close();
    return;
  }

  // ════════════════════════════════════════
  // STEP 2: Navigate to Invoices
  // ════════════════════════════════════════
  log("STEP", "Navigate ke /invoices...");
  try {
    await page.goto(`${BASE_URL}/invoices`, { waitUntil: "networkidle", timeout: 20000 });
    await sleep(3000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01-invoices-list.png"),
      fullPage: true,
    });
    log("PASS", "Invoices page loaded");

    // Check if there are invoices
    const invoiceRows = await page.locator("table tbody tr").count();
    log("INFO", `Found ${invoiceRows} invoice(s) in table`);

    if (invoiceRows === 0) {
      log("WARN", "Tidak ada invoice", "Mencoba cari empty state atau card...");
      const cards = await page.locator('[class*="card"], [class*="invoice"]').count();
      log("INFO", `Alternative elements found: ${cards}`);
    }
  } catch (err) {
    log("FAIL", "Invoices page error", err.message);
  }

  // ════════════════════════════════════════
  // STEP 3: Click Download PDF button for first invoice
  // ════════════════════════════════════════
  log("STEP", "Klik tombol Download PDF...");

  try {
    // The button has title="Download PDF" and opens new tab via window.open()
    const downloadBtn = page.locator('button[title="Download PDF"]').first();

    if ((await downloadBtn.count()) === 0) {
      log("WARN", "Download button tidak ditemukan, cari alternatif...");
      const altBtn = page.locator('button:has(svg.lucide-download)').first();
      if ((await altBtn.count()) > 0) {
        log("INFO", "Found download icon button");
      }
    }

    // Since handleDownloadPDF uses window.open(), we need to catch the new tab
    const popupPromise = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);

    await downloadBtn.click();
    log("INFO", "Clicked download button");

    const popup = await popupPromise;

    if (popup) {
      // It opened in a new tab — wait for it to load
      log("INFO", "New tab opened, waiting for PDF...");
      await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});

      const popupUrl = popup.url();
      log("INFO", `Popup URL: ${popupUrl}`);

      // The PDF route returns a PDF file directly
      const response = await popup.waitForResponse((res) => res.url().includes("/api/invoices/"), { timeout: 15000 }).catch(() => null);

      if (response) {
        const status = response.status();
        const contentType = response.headers()["content-type"] || "";
        log("INFO", `Response: ${status}, Content-Type: ${contentType}`);

        if (status === 200 && contentType.includes("pdf")) {
          // Get the PDF via page.request since popup consumed the response
          const pdfResponse = await popup.request.get(popupUrl);
          const buffer = await pdfResponse.body();
          const contentDisposition = pdfResponse.headers()["content-disposition"] || "";
          const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(?:;|$)/);
          const filename = filenameMatch ? filenameMatch[1] : "test-invoice.pdf";

          const pdfPath = path.join(SCREENSHOT_DIR, filename);
          fs.writeFileSync(pdfPath, buffer);

          log("PASS", "PDF berhasil di-generate!", `Size: ${buffer.length} bytes`);
          log("PASS", "Filename", filename);
          log("PASS", "Saved to", pdfPath);

          // Convert to PNG
          log("STEP", "Convert PDF ke PNG...");
          try {
            const { execSync } = await import("child_process");
            const pngPath = path.join(SCREENSHOT_DIR, filename.replace(".pdf", ".png"));
            execSync(`qlmanage -t -s 1200 -o "${SCREENSHOT_DIR}" "${pdfPath}" 2>&1`, { stdio: "pipe" });
            const qlOutput = path.join(SCREENSHOT_DIR, filename.replace(".pdf", ".pdf.png"));
            if (fs.existsSync(qlOutput)) {
              fs.renameSync(qlOutput, pngPath);
              log("PASS", "PDF preview saved", pngPath);
            }
          } catch (convErr) {
            log("WARN", "qlmanage conversion failed", convErr.message);
          }
        } else {
          const body = await popup.request.get(popupUrl).then((r) => r.text());
          log("FAIL", `API returned ${status}`, body.substring(0, 300));
        }
      } else {
        // Maybe the popup loaded the PDF directly in browser viewer
        log("INFO", "No response intercepted, checking popup content...");
        await popup.screenshot({ path: path.join(SCREENSHOT_DIR, "02-pdf-popup.png"), fullPage: true });

        // Try to fetch the PDF directly from the popup URL
        const directResponse = await context.request.get(popupUrl);
        const status = directResponse.status();
        const contentType = directResponse.headers()["content-type"] || "";
        log("INFO", `Direct fetch: ${status}, Content-Type: ${contentType}`);

        if (status === 200 && contentType.includes("pdf")) {
          const buffer = await directResponse.body();
          const contentDisposition = directResponse.headers()["content-disposition"] || "";
          const filenameMatch = contentDisposition.match(/filename="?(.+?)"?(?:;|$)/);
          const filename = filenameMatch ? filenameMatch[1] : "test-invoice.pdf";

          const pdfPath = path.join(SCREENSHOT_DIR, filename);
          fs.writeFileSync(pdfPath, buffer);

          log("PASS", "PDF berhasil di-download!", `Size: ${buffer.length} bytes`);
          log("PASS", "Filename", filename);

          // Convert to PNG
          try {
            const { execSync } = await import("child_process");
            const pngPath = path.join(SCREENSHOT_DIR, filename.replace(".pdf", ".png"));
            execSync(`qlmanage -t -s 1200 -o "${SCREENSHOT_DIR}" "${pdfPath}" 2>&1`, { stdio: "pipe" });
            const qlOutput = path.join(SCREENSHOT_DIR, filename.replace(".pdf", ".pdf.png"));
            if (fs.existsSync(qlOutput)) {
              fs.renameSync(qlOutput, pngPath);
              log("PASS", "PDF preview saved", pngPath);
            }
          } catch (convErr) {
            log("WARN", "qlmanage conversion failed", convErr.message);
          }
        } else {
          const body = await directResponse.text();
          log("FAIL", `Direct fetch returned ${status}`, body.substring(0, 300));
        }
      }

      await popup.close();
    } else {
      log("WARN", "No popup opened. Screenshot state...");
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-no-popup.png"), fullPage: true });
    }
  } catch (err) {
    log("FAIL", "Download button click error", err.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-error-state.png"), fullPage: true });
  }

  // ════════════════════════════════════════
  // STEP 5: Final screenshot
  // ════════════════════════════════════════
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "03-final-state.png"),
    fullPage: true,
  });

  // ════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════
  console.log("\n" + "━".repeat(60));
  console.log("  📊 Test Summary");
  console.log("━".repeat(60));
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`  Console errors: ${consoleLogs.filter((l) => l.includes("[error]")).length}`);

  const files = fs.readdirSync(SCREENSHOT_DIR);
  console.log(`  Output files: ${files.join(", ")}`);
  console.log("━".repeat(60));

  await browser.close();
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});