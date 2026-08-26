/**
 * E2E TEST: Simpan Creative Request (v95) di production
 * Flow: login → /content-studio → klik "Request Baru" → isi form → Simpan
 * → cek row muncul di list → verifikasi DB via REST → hapus row test.
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

  // 2. Buka content-studio
  await page.goto(`${BASE_URL}/content-studio`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(4000);
  console.log("✅ 2. Halaman content-studio terbuka");

  // 3. Klik Request Baru
  await page.getByRole("button", { name: /Request Baru/i }).first().click();
  await sleep(1500);
  if (!(await page.getByText("Creative Request Baru").count())) {
    console.error("💥 Modal tidak terbuka");
    await page.screenshot({ path: "scripts/screenshots/cr-save-fail-modal.png" });
    await browser.close();
    process.exit(1);
  }
  console.log("✅ 3. Modal 'Creative Request Baru' terbuka");

  // 4. Pilih klien (option pertama yang bukan placeholder)
  const clientSelect = page.locator("label:has-text('Klien')").locator("..").locator("select").first();
  // fallback: select pertama di modal
  const sel = (await clientSelect.count()) ? clientSelect : page.locator(".fixed select").first();
  const options = await sel.locator("option").all();
  let clientId = "";
  for (const o of options) {
    const v = await o.getAttribute("value");
    if (v && v !== "" && v !== "all") { clientId = v; break; }
  }
  if (!clientId) {
    console.error("💥 Tidak ada opsi klien aktif");
    await browser.close();
    process.exit(1);
  }
  await sel.selectOption(clientId);
  const clientName = await sel.locator(`option[value="${clientId}"]`).textContent();
  console.log(`✅ 4. Klien dipilih: ${clientName}`);

  // 5. Isi form
  await page.getByPlaceholder("Contoh: Promo Diskon / Testimoni / Before-After").fill(`${TAG} Angle Promo Diskon`);
  await page.getByPlaceholder('Kalimat pembuka yang terlihat sebelum "See more"...').fill(`${TAG} Hook: Berhenti buang duit ke iklan yang salah!`);
  await page.getByPlaceholder("Masalah → Solusi → Bukti...").fill(`${TAG} Caption: Masalah → Solusi → Bukti social proof.`);
  await page.getByPlaceholder("Contoh: Cek keranjang kuning sekarang").fill("Cek keranjang kuning sekarang");
  await page.getByPlaceholder("Halo kak, saya mau tanya produk...").fill("Halo kak, saya mau tanya produk...");
  console.log("✅ 5. Form terisi (angle/hook/caption/CTA/CTWA)");

  // 6. Klik Simpan
  await page.getByRole("button", { name: /^Simpan$/ }).first().click();
  await sleep(4000);
  const toastOk = await page.getByText("Request ditambahkan").count();
  const toastErr = await page.getByText("Gagal menyimpan").count();
  await page.screenshot({ path: "scripts/screenshots/cr-save-result.png" });
  if (toastErr) {
    console.error("💥 6. Toast ERROR: Gagal menyimpan");
    await browser.close();
    process.exit(1);
  }
  if (!toastOk) {
    console.error("💥 6. Toast sukses tidak muncul (simpan mungkin gagal diam-diam)");
    await browser.close();
    process.exit(1);
  }
  console.log("✅ 6. Toast 'Request ditambahkan' muncul — SIMPAN BERHASIL");

  // 7. Item muncul di list UI
  await sleep(2000);
  const inList = await page.getByText(TAG).count();
  console.log(`${inList > 0 ? "✅" : "⚠️"} 7. Item tampil di list UI (${inList} elemen)`);

  await browser.close();

  // 8. Verifikasi DB via REST
  const r = await rest(`/ads_creative_requests?angle=like.*${encodeURIComponent(TAG)}*&select=id,angle,hook,caption,client_id,status`);
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error("💥 8. Row TIDAK ditemukan di DB!");
    process.exit(1);
  }
  console.log(`✅ 8. Row tersimpan di DB: id=${rows[0].id} | status=${rows[0].status} | angle="${rows[0].angle.slice(0, 40)}..."`);

  // 9. Cleanup — hapus row test via REST
  const d = await rest(`/ads_creative_requests?id=eq.${rows[0].id}`, { method: "DELETE" });
  console.log(`${d.ok ? "✅" : "💥"} 9. Cleanup row test: ${d.ok ? "terhapus" : "GAGAL " + d.status}`);

  // 10. Konfirmasi DB kembali bersih
  const r2 = await rest(`/ads_creative_requests?angle=like.*${encodeURIComponent(TAG)}*&select=id`);
  const rows2 = await r2.json();
  console.log(`${rows2.length === 0 ? "✅" : "💥"} 10. DB bersih dari data test (${rows2.length} sisa)`);

  const allPass = d.ok && rows2.length === 0;
  console.log(allPass ? "\n🏁 E2E SIMPAN CREATIVE REQUEST: SEMUA LULUS ✅" : "\n🏁 E2E SELESAI DENGAN CATATAN ⚠️");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => { console.error("💥", e.message); process.exit(1); });