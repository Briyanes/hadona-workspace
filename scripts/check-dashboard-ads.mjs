// Verifikasi deploy Ads Manager di dashboard produksi
// Login dengan kredensial admin, cek widget "Ads Manager" di dashboard & tab di /content-studio
import { chromium } from "playwright";
import fs from "fs";

const APP_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SCREENSHOT_DIR = "scripts/screenshots/dashboard-ads-check";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Buka halaman login
  console.log("1. Membuka halaman login...");
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login-page.png`, fullPage: true });

  // 2. Isi form login
  console.log("2. Mengisi kredensial...");
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"], input[name="password"]').first();

  await emailInput.fill(EMAIL);
  await passInput.fill(PASSWORD);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-login-filled.png` });

  // 3. Submit login
  console.log("3. Submit login...");
  await page.locator('button[type="submit"], button:has-text("Masuk"), button:has-text("Login"), button:has-text("Sign in")').first().click();

  // Tunggu redirect ke dashboard (max 15 detik)
  await page.waitForURL((url) => !url.pathname.includes("login"), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  console.log("   URL sekarang:", page.url());
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-after-login.png`, fullPage: true });

  // 4. Cek card "Ads Manager" di dashboard
  console.log("\n4. Mencari card 'Ads Manager' di dashboard...");
  const adsCard = await page.locator('h3:has-text("Ads Manager")').count();
  console.log(`   Card 'Ads Manager': ${adsCard > 0 ? "✅ DITEMUKAN" : "❌ TIDAK ADA"}`);

  const smmCard = await page.locator('h3:has-text("SMM Upload Tracker")').count();
  const captionCard = await page.locator('h3:has-text("Caption Bank Performance")').count();
  console.log(`   Card 'SMM Upload Tracker': ${smmCard > 0 ? "✅" : "❌"}`);
  console.log(`   Card 'Caption Bank Performance': ${captionCard > 0 ? "✅" : "❌"}`);

  // Cek teks "Active Ads" (isi card Ads Manager)
  const activeAdsText = await page.locator('text=Active Ads').count();
  console.log(`   Teks 'Active Ads': ${activeAdsText > 0 ? "✅" : "❌"}`);

  // 5. Navigasi ke /content-studio
  console.log("\n5. Membuka /content-studio...");
  await page.goto(`${APP_URL}/content-studio`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-content-studio.png`, fullPage: true });

  // 6. Cek tab "Ads Manager"
  console.log("6. Mencari tab 'Ads Manager'...");
  const tabBtn = page.locator('button:has-text("Ads Manager"), [role="tab"]:has-text("Ads Manager")').first();
  const tabCount = await page.locator('button:has-text("Ads Manager"), [role="tab"]:has-text("Ads Manager")').count();
  console.log(`   Tab 'Ads Manager': ${tabCount > 0 ? "✅ DITEMUKAN" : "❌ TIDAK ADA"}`);

  if (tabCount > 0) {
    // 7. Klik tab
    console.log("7. Klik tab 'Ads Manager'...");
    await tabBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-ads-manager-tab.png`, fullPage: true });

    // Cek isi tab
    const emptyState = await page.locator('text=Belum ada data ads').count();
    const tableRows = await page.locator("table tbody tr").count();
    console.log(`   Empty state 'Belum ada data ads': ${emptyState > 0 ? "ADA (migrasi v84 belum di-apply)" : "TIDAK"}`);
    console.log(`   Jumlah baris tabel: ${tableRows}`);

    // Cek header kolom ads
    for (const header of ["Objective", "Funnel", "Format", "Status"]) {
      const found = await page.locator(`th:has-text("${header}")`).count();
      console.log(`   Kolom '${header}': ${found > 0 ? "✅" : "❌"}`);
    }
  }

  await browser.close();
  console.log("\n✅ Verifikasi selesai! Screenshot di:", SCREENSHOT_DIR);
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});