/**
 * Playwright script: Cek halaman /ads-spend (NON-INTERACTIVE)
 * Run: node scripts/check-ads-spend.mjs
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Capture console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("🔴 Console:", msg.text());
  });
  page.on("pageerror", (err) => console.log("🔴 PageError:", err.message));

  console.log("▶️  Opening:", BASE_URL + "/ads-spend");

  try {
    await page.goto(`${BASE_URL}/ads-spend`, {
      waitUntil: "networkidle",
      timeout: 25000,
    });
  } catch (e) {
    console.log("⏳ Goto timeout/redirect:", e.message.split("\n")[0]);
  }

  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  console.log("📍 Current URL:", currentUrl);

  if (currentUrl.includes("/login") || currentUrl.includes("/signup")) {
    console.log("\n⚠️  REDIRECTED TO LOGIN — butuh auth");
    console.log("   (Script ini tidak auto-login, hanya inspeksi page state)");
  }

  // Screenshot
  await page.screenshot({
    path: "scripts/screenshot-ads-spend.png",
    fullPage: true,
  });
  console.log("📸 Screenshot: scripts/screenshot-ads-spend.png");

  // Hitung elemen
  const unassignedCount = await page.locator("text=Unassigned").count();
  const rowCount = await page.locator("table tbody tr").count();
  const checkboxCount = await page.locator('table input[type="checkbox"]').count();
  const tableExists = (await page.locator("table").count()) > 0;
  const errorVisible = await page.locator("text=Gagal memuat").count();

  console.log("\n🔍 HASIL INSPEKSI:");
  console.log("   Table exists:", tableExists);
  console.log("   Total rows:", rowCount);
  console.log("   Unassigned count:", unassignedCount);
  console.log("   Checkbox count:", checkboxCount);
  console.log("   Error 'Gagal memuat':", errorVisible);

  // Ambil text body (excerpt) untuk debug
  const bodyText = await page.locator("body").innerText();
  console.log("\n📄 Body excerpt (first 800 chars):");
  console.log(bodyText.slice(0, 800));

  await browser.close();
  console.log("\n✅ Done");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});