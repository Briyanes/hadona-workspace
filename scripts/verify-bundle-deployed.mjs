/**
 * Verifikasi bundle production: login → /content-plans →
 * download semua chunk JS yang dimuat → grep string kode baru.
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const MARKERS = ["appearance-none rounded-full border-0 py-1 pl-2.5 pr-7", "rounded-full px-3 py-1 text-xs font-medium transition-colors"];
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
  console.log(`🌐 URL sekarang: ${page.url()}`);
  if (page.url().includes("/login")) {
    console.error("💥 LOGIN GAGAL — chunk content-plans tidak dimuat. Password salah / auth berubah.");
    await page.screenshot({ path: "scripts/screenshots/verify-login-fail.png" });
    await browser.close();
    process.exit(1);
  }
  const title = await page.locator("h1, h2").first().textContent().catch(() => "-");
  console.log(`📄 Judul halaman: ${title}`);

  // buka modal supaya lazy chunk modal ikut dimuat
  const row = page.locator("tr", { hasText: /SHUMI|Problem Aware/i }).first();
  if (await row.count()) {
    await row.click();
    await sleep(2500);
    console.log("✅ Modal dibuka (row ditemukan)");
  } else {
    console.log("⚠️ Row tidak ditemukan (mungkin view Card default / data beda)");
  }

  // DOM check langsung: badge pill select di table
  const domPill = await page.locator("select[title='Ubah progress']").count();
  console.log(`🖱️ select 'Ubah progress' di DOM: ${domPill}`);

  console.log(`📦 Chunk JS dimuat: ${scripts.size}`);
  const cpChunks = [...scripts].filter((u) => /content-plans|page|layout/.test(u)).slice(0, 8);
  console.log("🎯 Chunk kandidat:", cpChunks.map((u) => u.split("/").pop()).join(", "));
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
  const allFound = MARKERS.every((m) => found[m]);
  const verdict = allFound
    ? "DEPLOY c32af26 (badge pill select + card badge) SUDAH LIVE DI PRODUCTION ✅"
    : "SEBAGIAN MARKER TIDAK ADA — cek chunk lazy yang belum dimuat ⚠️";
  console.log(`\n🏁 VERDICT: ${verdict}`);
  await browser.close();
}
main().catch((e) => { console.error("💥", e.message); process.exit(1); });