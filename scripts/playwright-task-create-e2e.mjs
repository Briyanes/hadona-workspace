/**
 * Playwright TASK CREATE E2E TEST
 *
 * Verifikasi alur submit end-to-end setelah refactor state colocation:
 *   1. Login → /tasks → buka modal New Task
 *   2. Isi judul + deskripsi + prioritas, pilih client (jika ada)
 *   3. Submit → toast "Task berhasil dibuat!" muncul & modal tertutup
 *   4. Cek task baru tampil di board (kolom To Do)
 *   5. Cleanup: hapus task test via UI/detail agar DB bersih
 *
 * Env: BASE_URL (default http://localhost:3000), TEST_EMAIL, TEST_PASSWORD
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const TITLE = `[E2E-TEST] Verify create flow ${Date.now()}`;

if (!EMAIL || !PASSWORD) {
  console.error("Butuh TEST_EMAIL & TEST_PASSWORD di env");
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/tasks**", { timeout: 30000 }).catch(() => page.goto(`${BASE}/tasks`));
  await page.waitForLoadState("networkidle");
  console.log("✓ Login OK");

  // Buka modal & isi form
  await page.getByRole("button", { name: /new task/i }).click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ timeout: 10000 });
  await dialog.locator("input[type=\"text\"]").first().fill(TITLE);
  await dialog.locator("textarea").first().fill("Deskripsi test otomatis — aman dihapus");
  await dialog.locator("select").nth(2).selectOption("high"); // prioritas (0=client,1=status,2=priority urutan kolom kanan)
  console.log("✓ Form terisi");

  // Submit
  await dialog.getByRole("button", { name: /simpan task/i }).click();

  // Toast sukses
  await page.waitForSelector("text=Task berhasil dibuat!", { timeout: 15000 });
  console.log("✓ Toast sukses tampil");
  await dialog.waitFor({ state: "hidden", timeout: 10000 });
  console.log("✓ Modal tertutup setelah submit");

  // Verifikasi muncul di board
  await page.waitForLoadState("networkidle");
  const card = page.locator(`text=${TITLE}`).first();
  await card.waitFor({ timeout: 10000 });
  console.log("✓ Task tampil di board");

  // Cleanup: buka detail modal → hapus
  await card.click();
  const detail = page.locator('[role="dialog"]').last();
  await detail.waitFor({ timeout: 10000 });
  const delBtn = detail.getByRole("button", { name: /hapus|delete/i }).first();
  page.on("dialog", (d) => d.accept()); // auto-accept confirm
  await delBtn.click();
  await page.waitForTimeout(2500); // tunggu delete + reload list
  const stillThere = await page.locator(`text=${TITLE}`).count();
  console.log(stillThere === 0 ? "✓ Cleanup OK — task test dihapus" : `⚠ Task test masih ada (${stillThere}), hapus manual: ${TITLE}`);

  console.log("\n✅ PASS — alur create task end-to-end berfungsi pasca-refactor");
} catch (err) {
  console.error("❌ FAIL:", err.message);
  await page.screenshot({ path: "scripts/screenshots/task-create-e2e-fail.png" }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}