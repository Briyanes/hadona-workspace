/**
 * Verifikasi deploy v95: halaman /content-studio harus punya
 * tab "Creative Request" + modal request + tombol save-to-bank.
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
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
  await page.goto(`${BASE_URL}/content-studio`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(4000);

  if (page.url().includes("/login")) {
    console.error("💥 LOGIN GAGAL");
    await page.screenshot({ path: "scripts/screenshots/v95-login-fail.png" });
    await browser.close();
    process.exit(1);
  }

  // DOM checks
  const tabRequests = await page.getByText("Creative Request", { exact: false }).count();
  const statRequests = await page.getByText("Creative Request", { exact: true }).count();
  console.log(`🖱️ Tab/label "Creative Request" di DOM: ${tabRequests}`);

  // Buka modal request baru
  const btnNew = page.getByRole("button", { name: /Request Baru/i }).first();
  if (await btnNew.count()) {
    await btnNew.click();
    await sleep(2000);
    const modalTitle = await page.getByText("Creative Request Baru").count();
    console.log(`📋 Modal "Creative Request Baru": ${modalTitle ? "ADA ✅" : "TIDAK ADA ❌"}`);
    const hookField = await page.getByText("Hook (pembuka)").count();
    const ctwaField = await page.getByText("Prefilled Message (CTWA)").count();
    console.log(`🪝 Field Hook: ${hookField ? "ADA ✅" : "TIDAK ❌"} | CTWA: ${ctwaField ? "ADA ✅" : "TIDAK ❌"}`);
    await page.screenshot({ path: "scripts/screenshots/v95-modal.png" });
  } else {
    console.log("⚠️ Tombol 'Request Baru' tidak ditemukan (tab mungkin belum default/deploy belum selesai)");
    await page.screenshot({ path: "scripts/screenshots/v95-page.png" });
  }

  // Bundle grep
  const MARKERS = ["Prefilled Message (CTWA)", "Simpan ke Banking Caption?", "Creative Request Baru", "ads_creative_requests"];
  let found = {};
  for (const url of scripts) {
    try {
      const body = await (await page.request.get(url)).text();
      for (const m of MARKERS) {
        if (body.includes(m)) found[m] = (found[m] || 0) + 1;
      }
    } catch {}
  }
  console.log("═══ MARKER KODE v95 DI BUNDLE ═══");
  for (const m of MARKERS) {
    console.log(`  "${m}": ${found[m] ? `DITEMUKAN ✅` : "TIDAK ADA ❌"}`);
  }
  const allFound = MARKERS.every((m) => found[m]);
  console.log(`\n🏁 VERDICT: ${allFound ? "DEPLOY v95 (Ads Creative Requests) SUDAH LIVE ✅" : "BELUM TERDEPLOY / CHUNK LAZY ⚠️"}`);
  await browser.close();
}
main().catch((e) => { console.error("💥", e.message); process.exit(1); });