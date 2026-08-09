/**
 * Direct Invoice PDF Capture — uses Playwright to login, grab cookies,
 * then directly fetch the PDF API endpoint.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const BASE_URL = "https://workspace.hadona.id";
const TEST_EMAIL = "admin@hadona.id";
const TEST_PASSWORD = "@Yogyakarta2026";

const OUT_DIR = path.join(process.cwd(), "scripts", "screenshots", "invoice-test");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("▶️ Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Login
  console.log("▶️ Login...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 20000 });
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/", { timeout: 15000 }).catch(() => {});
  await sleep(3000);
  console.log("✅ Logged in:", page.url());

  // Go to invoices page and get invoice IDs
  console.log("▶️ Navigate to /invoices...");
  await page.goto(`${BASE_URL}/invoices`, { waitUntil: "networkidle", timeout: 20000 });
  await sleep(3000);

  // Find all download buttons (they contain data-invoice-id or similar)
  const buttons = await page.locator('button[title="Download PDF"]').all();
  console.log(`📋 Found ${buttons.length} download buttons`);

  // Get the href or data attribute from the first download button
  // The frontend uses window.open(`/api/invoices/${id}/pdf`)
  // Let's intercept the window.open call to get the URL
  let pdfUrl = null;
  await page.evaluate(() => {
    window.__pdfUrl = null;
    const origOpen = window.open;
    window.open = function (url) {
      window.__pdfUrl = url;
      return null; // prevent actual popup
    };
  });

  // Click first download button
  if (buttons.length > 0) {
    await buttons[0].click();
    await sleep(1000);
    pdfUrl = await page.evaluate(() => window.__pdfUrl);
  }

  if (!pdfUrl) {
    // Fallback: find invoice ID from table
    console.log("⚠️ Could not get PDF URL from click. Trying table row...");
    const firstRow = page.locator("table tbody tr").first();
    const rowText = await firstRow.textContent();
    console.log("Row text:", rowText?.substring(0, 200));
    
    // Try to find UUID pattern
    const uuidMatch = rowText?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      pdfUrl = `/api/invoices/${uuidMatch[0]}/pdf`;
      console.log("Found UUID:", uuidMatch[0]);
    }
  }

  console.log("🔗 PDF URL:", pdfUrl);

  if (!pdfUrl) {
    console.log("❌ Could not determine PDF URL");
    await browser.close();
    return;
  }

  // Fetch PDF directly using context.request (has cookies)
  const fullUrl = pdfUrl.startsWith("http") ? pdfUrl : `${BASE_URL}${pdfUrl}`;
  console.log("▶️ Fetching PDF:", fullUrl);
  
  const response = await context.request.get(fullUrl);
  console.log(`Response: ${response.status()}`);
  console.log(`Content-Type: ${response.headers()["content-type"]}`);

  if (response.status() === 200) {
    const buffer = await response.body();
    const pdfPath = path.join(OUT_DIR, "invoice-preview.pdf");
    fs.writeFileSync(pdfPath, buffer);
    console.log(`✅ PDF saved: ${pdfPath} (${buffer.length} bytes)`);

    // Convert to PNG
    try {
      console.log("▶️ Converting PDF to PNG...");
      execSync(`qlmanage -t -s 1400 -o "${OUT_DIR}" "${pdfPath}"`, { stdio: "pipe" });
      const qlOutput = path.join(OUT_DIR, "invoice-preview.pdf.png");
      const pngPath = path.join(OUT_DIR, "invoice-preview.png");
      if (fs.existsSync(qlOutput)) {
        fs.renameSync(qlOutput, pngPath);
        console.log(`✅ PNG saved: ${pngPath}`);
      }
    } catch (e) {
      console.log("⚠️ qlmanage conversion failed:", e.message);
      // Try sips
      try {
        execSync(`sips -s format png "${pdfPath}" --out "${path.join(OUT_DIR, "invoice-preview.png")}"`, { stdio: "pipe" });
        console.log("✅ PNG via sips");
      } catch (e2) {
        console.log("⚠️ sips also failed");
      }
    }
  } else {
    const body = await response.text();
    console.log("❌ Error body:", body.substring(0, 500));
  }

  await browser.close();
  console.log("✅ Done");
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});