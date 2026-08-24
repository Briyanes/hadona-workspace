/**
 * Verifikasi deploy: form "Entry Ads Creative Baru" di tab Ads Creative
 * harus punya selector "Jenis Posting" (Existing Post / Manual Upload).
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
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
    await page.screenshot({ path: "scripts/screenshots/posttype-login-fail.png" });
    await browser.close();
    process.exit(1);
  }

  // Klik tab "Ads Creative" (bisa label tab di halaman content-studio)
  const tabAds = page.getByRole("button", { name: /Ads Creative/i }).first();
  if (await tabAds.count()) {
    await tabAds.click();
    await sleep(2500);
    console.log("🖱️ Tab 'Ads Creative' diklik");
  } else {
    console.log("⚠️ Tab 'Ads Creative' tidak ditemukan — cek tab default");
  }

  // Klik "Entry Baru"
  const btnNew = page.getByRole("button", { name: /Entry Baru/i }).first();
  if (await btnNew.count()) {
    await btnNew.click();
    await sleep(2000);
    const hasJenis = await page.getByText("Jenis Posting", { exact: false }).count();
    console.log(`📋 Label "Jenis Posting" di modal: ${hasJenis ? "ADA ✅" : "TIDAK ADA ❌"}`);
    const hasExisting = await page.getByText("Existing Post", { exact: true }).count();
    const hasManual = await page.getByText("Manual Upload", { exact: true }).count();
    console.log(`🔄 Opsi "Existing Post": ${hasExisting ? "ADA ✅" : "TIDAK ❌"} | "Manual Upload": ${hasManual ? "ADA ✅" : "TIDAK ❌"}`);
    // Cek interaksi: pilih "Manual Upload" via select → caption harus aktif
    const sel = page.locator("select").filter({ has: page.locator('option[value="Manual Upload"]') }).first();
    if (await sel.count()) {
      await sel.selectOption("Manual Upload");
      await sleep(800);
      const captionEnabled = await page.locator("textarea:enabled").count();
      console.log(`⌨️ Textarea aktif setelah pilih Manual Upload: ${captionEnabled > 0 ? "YA ✅" : "TIDAK ❌"}`);
    } else {
      console.log("⚠️ Select 'Jenis Posting' tidak ditemukan dengan option value=Manual Upload");
    }
    await page.screenshot({ path: "scripts/screenshots/posttype-modal.png" });
  } else {
    console.log("⚠️ Tombol 'Entry Baru' tidak ditemukan (deploy mungkin belum selesai)");
    await page.screenshot({ path: "scripts/screenshots/posttype-page.png" });
  }

  // Bundle grep: marker harus ada di JS chunk yang diload
  const MARKERS = ["Jenis Posting", "Existing Post wajib diisi Content Link", "Manual Upload wajib diisi Caption", "Tetap Simpan"];
  let found = {};
  for (const url of scripts) {
    try {
      const res = await page.request.get(url);
      const body = await res.text();
      for (const m of MARKERS) if (body.includes(m)) found[m] = true;
    } catch {}
  }
  for (const m of MARKERS) console.log(`📦 Bundle "${m}": ${found[m] ? "ADA ✅" : "TIDAK ❌"}`);

  const allOk = MARKERS.every((m) => found[m]);
  fs.writeFileSync("scripts/screenshots/posttype-result.json", JSON.stringify({ ok: allOk, found }, null, 2));
  console.log(allOk ? "\n🎉 SEMUA MARKER TERDEPLOY" : "\n⏳ Belum semua marker ada — tunggu deploy selesai lalu rerun");
  await browser.close();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error("💥 Error:", e.message);
  process.exit(1);
});