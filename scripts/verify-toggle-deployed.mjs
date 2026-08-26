/**
 * Verifikasi deploy 2c0727a: toggle Card/Table pattern Task Board.
 * Login → /content-plans → download chunk JS → grep marker baru.
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const MARKERS = [
  "items-stretch overflow-hidden rounded-md",
  "flex items-center gap-1 px-3 text-xs font-medium transition-colors",
];
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
  console.log(`🌐 URL: ${page.url()}`);
  if (page.url().includes("/login")) {
    console.error("💥 LOGIN GAGAL");
    await browser.close();
    process.exit(1);
  }

  // DOM check langsung: container toggle baru ada di halaman
  const domToggle = await page.locator("div.flex.h-9.items-stretch").count();
  console.log(`🖱️ Toggle container (h-9 items-stretch) di DOM: ${domToggle}`);

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
  console.log("═══ HASIL PENCARIAN MARKER ═══");
  for (const m of MARKERS) {
    console.log(`  "${m}": ${found[m] ? `DITEMUKAN di ${found[m]} chunk ✅` : "TIDAK ADA ❌"}`);
  }
  const allFound = MARKERS.every((m) => found[m]);
  console.log(
    `\n🏁 VERDICT: ${allFound ? "DEPLOY 2c0727a (toggle Card/Table) SUDAH LIVE ✅" : "BELUM LIVE — deploy masih berjalan ⚠️"}`
  );
  await browser.close();
}
main().catch((e) => {
  console.error("💥", e.message);
  process.exit(1);
});