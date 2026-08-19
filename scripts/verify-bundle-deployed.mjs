/**
 * Verifikasi bundle production: login → /content-plans →
 * download semua chunk JS yang dimuat → grep string kode baru.
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
const MARKERS = ["Lihat selengkapnya", "Detail Content Plan", "content-plans-view", "Tampilan Card"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const scripts = new Set();
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/_next/") && url.endsWith(".js")) scripts.add(url);
  });

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await sleep(4000);
  await page.goto(`${BASE_URL}/content-plans`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(4000);

  // buka modal supaya lazy chunk modal ikut dimuat
  const row = page.locator("tr", { hasText: /SHUMI|Problem Aware/i }).first();
  if (await row.count()) {
    await row.click();
    await sleep(2500);
  }

  console.log(`📦 Chunk JS dimuat: ${scripts.size}`);
  let found = {};
  for (const url of scripts) {
    try {
      const body = await (await page.request.get(url)).text();
      for (const m of MARKERS) {
        if (body.includes(m)) found[m] = (found[m] || 0) + 1;
      }
    } catch {}
  }
  console.log("═══ HASIL PENCARIAN MARKER KODE BARU ═══");
  for (const m of MARKERS) {
    console.log(`  "${m}": ${found[m] ? `DITEMUKAN di ${found[m]} chunk ✅` : "TIDAK ADA ❌"}`);
  }
  const verdict = found["content-plans-view"] ? "DEPLOY CARD/TABLE TOGGLE SUDAH LIVE ✅" : (found["Lihat selengkapnya"] ? "Deploy sebelumnya live, toggle Card/Table BELUM (deploy baru masih jalan) ⏳" : "PRODUKSI MASIH KODE LAMA ⏳");
  console.log(`\n🏁 VERDICT: ${verdict}`);
  await browser.close();
}
main().catch((e) => { console.error("💥", e.message); process.exit(1); });