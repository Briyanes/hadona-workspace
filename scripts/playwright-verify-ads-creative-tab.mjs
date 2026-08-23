/**
 * VERIFIKASI: Tab "Clustering Content" -> "Ads Creative" di production
 * Flow: login → /content-studio → assert tab "Ads Creative" tampil,
 * "Clustering Content" hilang → klik tab → konten render → screenshot.
 * Auto-retry hingga deploy Vercel selesai (maks ~6 menit).
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 8;
const RETRY_MS = 45000;

async function checkOnce(attempt) {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  try {
    // 1. Login
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(1500);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await sleep(4000);
    if (page.url().includes("/login")) throw new Error("LOGIN GAGAL");
    console.log(`✅ 1. Login OK (attempt ${attempt})`);

    // 2. Buka content-studio (hard reload agar tidak kena cache SW)
    await page.goto(`${BASE_URL}/content-studio`, { waitUntil: "networkidle", timeout: 30000 });
    await page.reload({ waitUntil: "networkidle" });
    await sleep(4000);
    console.log("✅ 2. Halaman content-studio terbuka");

    // 3. Assert tab baru
    const hasNewTab = await page.getByRole("button", { name: /Ads Creative/i }).count();
    const hasOldTab = await page.getByText("Clustering Content").count();
    const hasOldSubtitle = await page.getByText("clustering content").count();
    await page.screenshot({ path: "scripts/screenshots/ads-creative-tab.png", fullPage: false });
    if (!hasNewTab) throw new Error("Tab 'Ads Creative' BELUM tampil (deploy mungkin belum selesai)");
    if (hasOldTab || hasOldSubtitle) throw new Error("Teks lama 'Clustering Content' masih ada");
    console.log("✅ 3. Tab 'Ads Creative' tampil & 'Clustering Content' hilang");

    // 4. Stat card
    const statCard = await page.locator(".card", { hasText: "Ads Creative" }).count();
    console.log(`${statCard > 0 ? "✅" : "⚠️"} 4. Stat card 'Ads Creative' (${statCard} ditemukan)`);

    // 5. Klik tab Ads Creative
    await page.getByRole("button", { name: /Ads Creative/i }).first().click();
    await sleep(2500);
    const toolbar = await page.getByPlaceholder("Cari theme / format / klien...").count();
    const btnEntry = await page.getByRole("button", { name: /Entry Baru/i }).count();
    await page.screenshot({ path: "scripts/screenshots/ads-creative-tab-active.png", fullPage: false });
    if (!toolbar && !btnEntry) throw new Error("Konten tab tidak render setelah klik");
    console.log("✅ 5. Tab diklik — konten render (toolbar/Entry Baru tampil)");

    // 6. Dua tab lain tetap ada
    const tabReq = await page.getByRole("button", { name: /Creative Request/i }).count();
    const tabCap = await page.getByRole("button", { name: /Banking Caption/i }).count();
    if (!tabReq || !tabCap) throw new Error("Tab lain hilang!");
    console.log("✅ 6. Tab 'Creative Request' & 'Banking Caption' tetap ada");

    await browser.close();
    return true;
  } catch (e) {
    console.error(`   ⚠️ Attempt ${attempt}: ${e.message}`);
    await browser.close();
    return false;
  }
}

async function main() {
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    if (await checkOnce(i)) {
      console.log("\n🏁 VERIFIKASI RENAME TAB: LULUS SEMUA ✅");
      process.exit(0);
    }
    if (i < MAX_ATTEMPTS) {
      console.log(`   ⏳ Tunggu deploy Vercel... retry dalam ${RETRY_MS / 1000}s\n`);
      await sleep(RETRY_MS);
    }
  }
  console.error("\n💥 GAGAL setelah beberapa attempt — cek deploy Vercel manual.");
  process.exit(1);
}

main().catch((e) => { console.error("💥", e.message); process.exit(1); });