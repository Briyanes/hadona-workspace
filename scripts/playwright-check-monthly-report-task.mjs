/**
 * Playwright Audit: Cek lokasi task "MONTLY REPORT TPDOC" di board
 * Login → /tasks (Board view) → scan kolom → buka task detail → cek dashboard
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "monthly-report-task-check");

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // === STEP 1: Login ===
    console.log("🔐 Logging in...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);

    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.count()) await emailInput.fill(EMAIL);

    const pwdInput = page.locator('input[type="password"], input[name="password"]');
    if (await pwdInput.count()) await pwdInput.fill(PASSWORD);

    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
    if (await submitBtn.count()) await submitBtn.first().click();

    await sleep(4000);
    if (page.url().includes("/login")) {
      console.log("⚠️ Still on login page, waiting more...");
      await sleep(4000);
    }
    console.log("✅ Logged in, URL:", page.url());

    // === STEP 2: Navigate to Tasks ===
    console.log("📋 Navigating to /tasks...");
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);

    // === STEP 3: Board view ===
    console.log("📊 Ensuring Board view...");
    const boardBtn = page.locator('button:has-text("Board")');
    if (await boardBtn.count()) {
      await boardBtn.first().click();
      await sleep(2000);
    }

    // === STEP 4: Scan board untuk task TPDOC ===
    console.log("🔍 Scanning board for task TPDOC...");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-tasks-board.png"), fullPage: true });

    // Ambil semua kartu task di board
    const allText = await page.textContent("body");
    const tpdocMentioned = allText.toLowerCase().includes("tpdoc");
    console.log(`🔎 Kata "TPDOC" ${tpdocMentioned ? "DITEMUKAN" : "TIDAK DITEMUKAN"} di halaman board`);

    // Coba cari elemen task card yang mengandung TPDOC
    const taskCard = page.locator('text=/tpdoc/i').first();
    let foundColumn = "TIDAK DITEMUKAN";

    if (tpdocMentioned && (await taskCard.count())) {
      // Scroll ke kartu untuk memastikan terlihat
      await taskCard.scrollIntoViewIfNeeded().catch(() => {});
      await sleep(500);

      // Cari kolom induk (parent) kartu — cek heading kolom
      const columnHeaders = await page.locator('h2, h3, [class*="column"] [class*="header"], [class*="board-col"]').allTextContents();
      console.log("🗂️ Kolom board terdeteksi:", columnHeaders.slice(0, 10));

      // Screenshot kartu task
      await taskCard.screenshot({ path: path.join(SCREENSHOT_DIR, "02-task-card.png") }).catch(() => {});

      // Klik task untuk buka detail modal
      console.log("🖱️ Clicking task card to open detail...");
      await taskCard.click();
      await sleep(3000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-task-detail-modal.png"), fullPage: true });

      // Baca info modal — cari status badge
      const modalText = await page.textContent("body").catch(() => "");
      const statuses = ["todo", "in-progress", "in progress", "review", "done"];
      for (const s of statuses) {
        if (modalText.toLowerCase().includes(s)) {
          foundColumn = s;
          break;
        }
      }
      console.log(`📍 Status task (dari modal): ${foundColumn}`);
    } else {
      console.log("⚠️ Task TPDOC tidak terlihat di board — mungkin perlu filter/scroll");
    }

    // === STEP 5: Cek filter Done ===
    console.log("🔍 Trying to check via search/filter...");
    // Coba pakai global search jika ada
    const searchTrigger = page.locator('button:has-text("Search"), [data-testid="global-search"], kbd');
    if (await searchTrigger.count()) {
      await page.keyboard.press("Meta+k").catch(() => {});
      await sleep(1500);
      const searchInput = page.locator('input[placeholder*="Search" i]').first();
      if (await searchInput.count()) {
        await searchInput.fill("TPDOC");
        await sleep(2000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-global-search.png"), fullPage: true });
        const searchResults = await page.textContent("body");
        if (searchResults.toLowerCase().includes("tpdoc")) {
          console.log("✅ Task TPDOC ditemukan via global search");
        }
      }
    }

    // === STEP 6: Cek Dashboard ===
    console.log("🏠 Checking dashboard...");
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-dashboard.png"), fullPage: true });
    const dashText = await page.textContent("body");
    console.log(`🔎 Dashboard ${dashText.toLowerCase().includes("tpdoc") ? "MENAMPILKAN" : "TIDAK menampilkan"} task TPDOC`);

    // === STEP 7: Cek menu Monthly Reports ===
    console.log("📄 Checking /monthly-reports...");
    await page.goto(`${BASE_URL}/monthly-reports`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(4000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-monthly-reports.png"), fullPage: true });
    const mrText = await page.textContent("body");
    console.log(`🔎 Monthly Reports page ${mrText.toLowerCase().includes("tpdoc") ? "MENAMPILKAN" : "TIDAK menampilkan"} report TPDOC`);

    // === SUMMARY ===
    console.log("\n========== SUMMARY ==========");
    console.log(`Task TPDOC di board: ${foundColumn}`);
    console.log(`Di dashboard: ${dashText.toLowerCase().includes("tpdoc") ? "YES" : "NO"}`);
    console.log(`Di monthly reports: ${mrText.toLowerCase().includes("tpdoc") ? "YES" : "NO"}`);
    console.log(`Screenshots: ${SCREENSHOT_DIR}`);
    console.log("=============================");
  } catch (err) {
    console.error("❌ Error:", err.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();