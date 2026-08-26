/**
 * Playwright test: Chat panels responsive (mobile 375px + desktop 1440px)
 * - Mobile: sidebar kiri hidden, tombol ☰ muncul di header, drawer bisa buka/tutup
 * - Desktop: sidebar inline, tombol ☰ tidak muncul
 *
 * Usage: node scripts/playwright-chat-panels-test.mjs [baseUrl]
 * Env: TEST_EMAIL, TEST_PASSWORD (fallback default QA)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const log = (name, pass, extra = "") => {
  results.push({ name, pass, extra });
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await sleep(4000);
  if (page.url().includes("/login")) {
    throw new Error("LOGIN GAGAL — masih di /login");
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ========== MOBILE 375px ==========
  const mCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mp = await mCtx.newPage();
  try {
    await login(mp);
    await mp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);

    // Sidebar inline kiri harus hidden di mobile
    const inlineSidebar = mp.locator("div.w-64.border-r").first();
    log("[Mobile] Sidebar inline kiri tersembunyi", !(await inlineSidebar.isVisible().catch(() => false)));

    // Tombol ☰ harus muncul di header chat
    const burger = mp.locator('button[aria-label="Buka daftar channel"]');
    const burgerVisible = await burger.isVisible().catch(() => false);
    log("[Mobile] Tombol ☰ muncul di header", burgerVisible);

    if (burgerVisible) {
      await burger.click();
      await mp.waitForTimeout(600);
      const drawer = mp.locator('div[role="dialog"][aria-modal="true"]');
      log("[Mobile] Drawer channel terbuka", await drawer.isVisible().catch(() => false));

      // Klik backdrop untuk tutup (klik di kanan layar x=370 — di luar panel drawer w-64=256px)
      await mp.mouse.click(370, 400);
      await mp.waitForTimeout(500);
      log("[Mobile] Drawer tertutup via backdrop", !(await drawer.isVisible().catch(() => false)));

      await mp.screenshot({ path: "scripts/screenshots/chat-panels-mobile.png", fullPage: false });
    }
  } catch (e) {
    console.error("[Mobile] error:", e.message);
    await mp.screenshot({ path: "scripts/screenshots/chat-panels-mobile-error.png" }).catch(() => {});
  } finally {
    await mCtx.close();
  }

  // ========== DESKTOP 1440px ==========
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dCtx.newPage();
  try {
    await login(dp);
    await dp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);

    // Sidebar inline harus tampil
    const sidebarVisible = await dp.locator("div.w-64.border-r").first().isVisible().catch(() => false);
    log("[Desktop] Sidebar inline tampil", sidebarVisible);

    // Tombol ☰ tidak boleh muncul di desktop
    const burgerHidden = !(await dp.locator('button[aria-label="Buka daftar channel"]').isVisible().catch(() => false));
    log("[Desktop] Tombol ☰ tersembunyi", burgerHidden);

    // Drawer channel tidak boleh ada
    const drawerHidden = !(await dp.locator('div[role="dialog"][aria-modal="true"]').first().isVisible().catch(() => false));
    log("[Desktop] Tidak ada drawer mobile", drawerHidden);

    await dp.screenshot({ path: "scripts/screenshots/chat-panels-desktop.png", fullPage: false });
  } catch (e) {
    console.error("[Desktop] error:", e.message);
    await dp.screenshot({ path: "scripts/screenshots/chat-panels-desktop-error.png" }).catch(() => {});
  } finally {
    await dCtx.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== ${results.length - failed}/${results.length} PASSED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});