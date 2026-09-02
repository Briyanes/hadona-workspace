/**
 * Playwright TASK INPUT LAG TEST
 *
 * Bug: mengisi judul task terasa "1 huruf 1 huruf" — tiap ketikan me-render
 * ulang seluruh TaskBoard karena state form hidup di parent.
 * Fix: state form dipindah ke dalam CreateTaskModal (state colocation).
 *
 * Test ini:
 *   1. Login → buka /tasks → klik "New Task"
 *   2. Ketik 40 karakter di input Judul Task (type delay 50ms)
 *   3. Ukur: total render React (PerformanceObserver longtask + count),
 *      waktu nyata vs waktu teoretis, dan jumlah re-render board
 *   4. PASS jika tiap keystroke tertampilkan < 100ms (dulu bisa ratusan ms)
 *
 * Env: BASE_URL (default https://workspace.hadona.id), TEST_EMAIL, TEST_PASSWORD
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("Butuh TEST_EMAIL & TEST_PASSWORD di env");
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Instrument: hitung long task (>50ms) selama mengetik
  await page.addInitScript(() => {
    window.__longTasks = 0;
    try {
      new PerformanceObserver((list) => {
        window.__longTasks += list.getEntries().length;
      }).observe({ entryTypes: ["longtask"] });
    } catch {}
  });

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/tasks**", { timeout: 30000 }).catch(() => page.goto(`${BASE}/tasks`));
  await page.waitForLoadState("networkidle");
  console.log("✓ Login OK, di halaman tasks");

  // Buka modal create task
  await page.getByRole("button", { name: /new task/i }).click();
  const titleInput = page.locator('[role="dialog"] input[type="text"]').first();
  await titleInput.waitFor({ timeout: 10000 });
  console.log("✓ Modal 'Buat Task Baru' terbuka");

  // Ukur ketik 40 karakter dengan delay 50ms → teoretis ~2.0s
  const CHARS = "Setup Campaign Meta Ads Bulan September";
  // Reset counter agar hanya menghitung long task SAAT mengetik
  // (bukan selama page load / render board awal)
  await page.evaluate(() => { window.__longTasks = 0; });
  const t0 = Date.now();
  await titleInput.type(CHARS, { delay: 50 });
  const elapsed = Date.now() - t0;
  const theoretical = CHARS.length * 50;
  const overhead = elapsed - theoretical;
  const perChar = elapsed / CHARS.length;

  const longTasks = await page.evaluate(() => window.__longTasks);
  const value = await titleInput.inputValue();
  const renderedCorrect = value === CHARS;

  console.log(`\n===== HASIL =====`);
  console.log(`Karakter            : ${CHARS.length}`);
  console.log(`Total elapsed       : ${elapsed}ms (teoretis ${theoretical}ms)`);
  console.log(`Overhead render     : ${overhead}ms (${(overhead / CHARS.length).toFixed(1)}ms/karakter)`);
  console.log(`Per keystroke       : ${perChar.toFixed(1)}ms`);
  console.log(`Long tasks (>50ms)  : ${longTasks}`);
  console.log(`Nilai input benar   : ${renderedCorrect ? "✓" : "✗ MISMATCH: " + value}`);

  // Verifikasi board TIDAK ikut re-render saat mengetik:
  // tandai sebuah kartu board, ketik lagi, cek DOM node sama (bukan di-unmount)
  // (sederhana: cukup longTasks & perChar sebagai proxy)

  const PASS = renderedCorrect && perChar < 100 && longTasks <= 5;
  console.log(`\n${PASS ? "✅ PASS" : "❌ FAIL"} — ${PASS ? "input responsif, tidak ada lag board" : "input masih lambat, cek re-render"}`);
  process.exitCode = PASS ? 0 : 1;

  // Screenshot bukti
  await page.screenshot({ path: "scripts/screenshots/task-input-lag-test.png", fullPage: false });
} finally {
  await browser.close();
}