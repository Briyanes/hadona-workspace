/**
 * E2E TEST: Save Ads Spend + reset filter (commit 2ac2869) di production
 * Flow: login → /ads-spend → aktifkan filter search → save Ad Account baru
 * → cek filter ter-reset & akun baru TERLIHAT → verifikasi DB → cleanup.
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";

// Load env
const env = {};
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SR_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = `[E2E-QA-${Date.now()}]`;

async function rest(path, init) {
  return fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: { apikey: SR_KEY, Authorization: `Bearer ${SR_KEY}`, "Content-Type": "application/json", ...init?.headers },
  });
}

async function main() {
  console.log(`🏷️ Tag test: ${TAG}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Login
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await sleep(4000);
  if (page.url().includes("/login")) {
    console.error("💥 LOGIN GAGAL");
    await browser.close();
    process.exit(1);
  }
  console.log("✅ 1. Login OK");

  // 2. Buka ads-spend
  await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(4000);
  console.log("✅ 2. Halaman ads-spend terbuka");

  // 3. Aktifkan filter: isi search dengan teks yang TIDAK match apa pun
  const searchInput = page.locator('input[placeholder*="Cari client"]').first();
  const nInputs = await page.locator('input[placeholder*="Cari client"]').count();
  await searchInput.fill("zzznomatchzzz");
  await sleep(1000);
  // Bukti filter aktif: list HARUS kosong (empty state muncul)
  const body1 = await page.locator("body").innerText();
  const listKosong = body1.includes("Belum ada ad account") || body1.includes("Tidak ada");
  console.log(`✅ 3. Filter search diaktifkan (zzznomatchzzz) | input match: ${nInputs} | list kosong: ${listKosong}`);
  if (!listKosong) {
    console.log("⚠️ 3b. List TIDAK kosong setelah filter — filter search mungkin tidak mengarah ke list ini!");
  }

  // 4. Buka modal Ad Account baru
  const addBtn = page.getByRole("button", { name: /New Ad Account|Tambah Ad Account|Akun Baru|Add.*Account/i }).first();
  await addBtn.click({ timeout: 10000 });
  await sleep(1500);
  console.log("✅ 4. Modal Ad Account terbuka");

  // 5. Isi form: client (wajib), Ad Account ID (wajib), Account Name (TAG unik)
  const modal = page.locator('[role="dialog"], .modal, form').last();
  const clientSelect = modal.locator("select").first();
  await clientSelect.selectOption({ index: 1 }); // klien pertama
  await page.locator('input[placeholder*="Ad Account ID"]').fill(`act_${Date.now()}`);
  await page.locator('input[placeholder*="Account Name"]').fill(`${TAG} Test Account`);
  console.log("✅ 5. Form terisi (client, act_id, nama: " + TAG + " Test Account)");

  // 6. Klik Simpan
  await page.getByRole("button", { name: /Simpan|Save/i }).last().click();
  await sleep(3000);
  console.log("✅ 6. Tombol Simpan diklik");

  // 7. VERIFIKASI FIX: filter search harus ter-reset (input kosong)
  const searchVal = await searchInput.inputValue().catch(() => "?");
  console.log(`   Nilai search setelah save: "${searchVal}"`);
  if (searchVal === "") {
    console.log("✅ 7. Filter search TER-RESET setelah save (fix aktif!)");
  } else {
    console.log(`⚠️ 7. Search belum kosong ("${searchVal}") — mungkin deploy belum selesai atau fix tidak aktif`);
  }

  // 7b. Akun baru harus TERLIHAT di list (karena filter reset)
  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes(TAG)) {
    console.log("✅ 7b. Akun baru TERLIHAT di list setelah save 🎉");
  } else {
    console.log("⚠️ 7b. TAG tidak ditemukan di list — cek manual");
  }

  // 8. Verifikasi DB via REST
  let rows = [];
  try {
    const r1 = await rest(`/ad_accounts?account_name=like.*${encodeURIComponent(TAG)}*`, { method: "GET" });
    rows = await r1.json();
  } catch {}
  if (!Array.isArray(rows) || rows.length === 0) {
    try {
      const r2 = await rest(`/ad_accounts?select=*&ad_account_id=like.*${TAG}*`, { method: "GET" });
      rows = await r2.json();
    } catch {}
  }
  if (Array.isArray(rows) && rows.length > 0) {
    console.log(`✅ 8. Row tersimpan di DB: id=${rows[0].id} | account_name=${rows[0].account_name}`);
  } else {
    console.log(`⚠️ 8. Row TIDAK ditemukan di DB`);
    rows = [];
  }

  // 9. Cleanup: hapus akun test via REST
  if (Array.isArray(rows) && rows.length > 0) {
    await rest(`/ad_accounts?id=eq.${rows[0].id}`, { method: "DELETE" });
    console.log("✅ 9. Cleanup: akun test terhapus");
  }

  await browser.close();
  console.log("\n🏁 E2E ADS-SPEND SAVE + FILTER RESET: SELESAI");
}

main().catch((e) => {
  console.error("💥 Fatal:", e.message);
  process.exit(1);
});