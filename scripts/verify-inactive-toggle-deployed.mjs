/**
 * Verifikasi deploy: toggle "Non-aktif" di tab Ads Creative.
 * - List default hanya client aktif; toggle chip muncul jika ada entry client non-aktif.
 */
import { chromium } from "playwright";
import fs from "fs";

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
    console.error("LOGIN GAGAL");
    await page.screenshot({ path: "scripts/screenshots/inactive-login-fail.png" });
    await browser.close();
    process.exit(1);
  }

  const tabAds = page.getByRole("button", { name: /Ads Creative/i }).first();
  if (await tabAds.count()) {
    await tabAds.click();
    await sleep(3000);
    console.log("Tab 'Ads Creative' diklik");
  } else {
    console.log("Tab 'Ads Creative' tidak ditemukan — cek tab default");
  }

  // 1) Chip toggle "Non-aktif (N)" — hanya muncul jika ada entry client non-aktif
  const chip = page.locator("button", { hasText: /Non-aktif \(\d+\)/ }).first();
  const chipVisible = await chip.count();
  if (chipVisible) {
    const txt = await chip.textContent();
    console.log(`Chip toggle ADA: "${txt?.trim()}"`);
    // 2) Klik toggle → badge "non-aktif" muncul di list
    await chip.click();
    await sleep(1500);
    const badges = await page.locator("span", { hasText: "non-aktif" }).count();
    console.log(`Badge 'non-aktif' di list setelah toggle ON: ${badges} kemunculan ${badges > 0 ? "OK" : "(0 — cek data)"}`);
    await page.screenshot({ path: "scripts/screenshots/inactive-toggle-on.png" });
    // toggle off lagi
    await chip.click();
    await sleep(1000);
  } else {
    console.log("Chip toggle TIDAK tampil (mungkin tidak ada entry client non-aktif, atau deploy belum selesai)");
  }

  // 3) Dropdown filter harus "Semua Klien" (bukan semua client non-aktif ikut)
  const hasFilter = await page.getByText("Semua Klien", { exact: true }).count();
  console.log(`Dropdown 'Semua Klien': ${hasFilter ? "ADA" : "TIDAK"}`);

  // 4) Bundle markers
  const MARKERS = [
    "Non-aktif (",
    "Tampilkan entry client non-aktif",
    "Sembunyikan entry client non-aktif",
    "Semua Kelengkapan",
  ];
  let found = {};
  for (const url of scripts) {
    try {
      const res = await page.request.get(url);
      const body = await res.text();
      for (const m of MARKERS) if (body.includes(m)) found[m] = true;
    } catch {}
  }
  for (const m of MARKERS) console.log(`Bundle "${m}": ${found[m] ? "ADA" : "TIDAK"}`);

  const allOk = MARKERS.every((m) => found[m]);
  fs.writeFileSync(
    "scripts/screenshots/inactive-toggle-result.json",
    JSON.stringify({ ok: allOk, found, chipVisible: !!chipVisible }, null, 2)
  );
  console.log(allOk ? "\nSEMUA MARKER TERDEPLOY" : "\nBelum semua marker ada — tunggu deploy lalu rerun");
  await browser.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});