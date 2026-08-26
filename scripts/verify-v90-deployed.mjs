/**
 * Verifikasi deploy 5359bab: divisi Editor resmi di Task Board.
 * - Tab "Editor" ada di /tasks
 * - Tab "Content Production" TIDAK ada
 * - Dropdown form "New Task" tidak punya opsi Content Production
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

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await sleep(4000);
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(5000);

  if (page.url().includes("/login")) {
    console.error("💥 LOGIN GAGAL");
    await page.screenshot({ path: "scripts/screenshots/verify-v90-login-fail.png" });
    await browser.close();
    process.exit(1);
  }
  console.log(`🌐 URL: ${page.url()}`);

  // Check division tabs
  const tabEditor = await page.locator("button", { hasText: "Editor" }).count();
  const tabContentProd = await page.locator("button", { hasText: "Content Production" }).count();
  console.log(`🖱️ Tab "Editor" di DOM: ${tabEditor} ${tabEditor > 0 ? "✅" : "❌"}`);
  console.log(`🖱️ Tab "Content Production" di DOM: ${tabContentProd} ${tabContentProd === 0 ? "✅ (sudah dihapus)" : "❌ (masih ada — deploy lama?)"}`);

  // Click Editor tab, verify tasks load
  if (tabEditor > 0) {
    await page.locator("button", { hasText: "Editor" }).first().click();
    await sleep(3000);
    const url = page.url();
    console.log(`🔗 URL setelah klik tab Editor: ${url}`);
    const boardCards = await page.locator("[data-rbd-draggable-id]").count().catch(() => 0);
    const tableRows = await page.locator("tbody tr").count().catch(() => 0);
    console.log(`🗂️ Task Editor (draggable cards): ${boardCards}, table rows: ${tableRows}`);
    // klik kartu pertama untuk cek division label
    if (boardCards > 0) {
      await page.locator("[data-rbd-draggable-id]").first().click();
      await sleep(2500);
      const modalText = await page.locator("body").innerText();
      const hasEditorLabel = modalText.includes("Editor");
      const hasCPLabel = modalText.includes("Content Production");
      console.log(`🔍 Modal detail task: mengandung "Editor": ${hasEditorLabel ? "✅" : "—"}, "Content Production": ${hasCPLabel ? "⚠️ masih ada" : "✅ tidak ada"}`);
    }
  }

  // Check New Task form dropdown
  await page.locator("button", { hasText: "New Task" }).first().click();
  await sleep(2000);
  const formOpts = await page.locator("select option").allTextContents().catch(() => []);
  const divOpts = formOpts.filter((t) => /Editor|Content Production|Production|Social Media/i.test(t));
  console.log(`📝 Opsi divisi di form: ${divOpts.join(" | ")}`);
  const formHasCP = divOpts.some((t) => t.includes("Content Production"));
  console.log(`📝 Form punya opsi "Content Production": ${formHasCP ? "❌ masih ada" : "✅ sudah dihapus"}`);

  await page.screenshot({ path: "scripts/screenshots/verify-v90-tasks.png", fullPage: false });

  const pass = tabEditor > 0 && tabContentProd === 0 && !formHasCP;
  console.log(`\n🏁 VERDICT: ${pass ? "DEPLOY 5359bab LIVE — divisi Editor resmi ✅" : "BELUM TER-DEPLOY / sebagian gagal ⚠️ (tunggu build Vercel ±2 menit, lalu rerun)"}`);
  await browser.close();
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error("💥", e.message); process.exit(1); });