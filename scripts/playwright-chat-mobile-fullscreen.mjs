/**
 * Playwright test: Chat mobile fullscreen pattern (ala Telegram)
 * - Mobile 375px: PageHeader hidden, daftar channel = layar utama, bottom nav hidden
 * - Klik channel → chat fullscreen (fixed inset-0), tombol back muncul
 * - Tombol back → kembali ke daftar channel
 * - Desktop 1440px: PageHeader + sidebar inline tampil
 *
 * Usage: node scripts/playwright-chat-mobile-fullscreen.mjs [baseUrl]
 * Env: TEST_EMAIL, TEST_PASSWORD (fallback default QA)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SHOT_DIR = "scripts/screenshots";
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
    await mp.screenshot({ path: `${SHOT_DIR}/chat-mobile-list.png`, fullPage: false });

    // 1. PageHeader "Team Chat" harus hidden di mobile
    const headerH1 = mp.locator("h1", { hasText: "Team Chat" });
    log("[Mobile] PageHeader hidden", !(await headerH1.isVisible().catch(() => false)));

    // 2. Bottom nav harus hidden di /chat
    const bottomNav = mp.locator("nav.fixed.bottom-0");
    log("[Mobile] Bottom nav hidden di /chat", (await bottomNav.count()) === 0);

    // 3. Header layar list mobile ("Chat" + jumlah percakapan) tampil & tidak menempel di atas
    const listHeader = mp.locator("h2", { hasText: "Chat" });
    const headerVisible = await listHeader.isVisible().catch(() => false);
    log("[Mobile] Header 'Chat' tampil", headerVisible);
    if (headerVisible) {
      const box = await listHeader.boundingBox();
      const notStuck = box && box.y >= 8;
      log("[Mobile] Header punya ruang atas (tidak menempel)", !!notStuck, box ? `y=${Math.round(box.y)}` : "");
    }

    // 4. Daftar channel (layar utama) terlihat — section "Channels" (scoped ke list mobile)
    const channelsSection = mp.locator('[data-testid="mobile-channel-list"] p', { hasText: "Channels" }).first();
    log("[Mobile] Daftar channel tampil sebagai layar utama", await channelsSection.isVisible().catch(() => false));

    // Klik channel pertama → chat fullscreen (scoped ke list mobile agar tidak match sidebar desktop yang hidden)
    const channelItem = mp.locator('[data-testid="mobile-channel-list"] div.flex.flex-col.gap-0\\.5 button').first();
    await channelItem.click();
    await sleep(2500);
    await mp.screenshot({ path: `${SHOT_DIR}/chat-mobile-open.png`, fullPage: false });

    // Chat fullscreen: header channel dengan tombol back
    const backBtn = mp.locator('button[aria-label="Kembali ke daftar channel"]');
    const backVisible = await backBtn.isVisible().catch(() => false);
    log("[Mobile] Chat fullscreen terbuka + tombol back", backVisible);

    // 5. Tombol back → kembali ke daftar
    if (backVisible) {
      await backBtn.click();
      await sleep(1200);
      const listBack = await mp.locator('[data-testid="mobile-channel-list"] p', { hasText: "Direct Messages" }).isVisible().catch(() => false);
      log("[Mobile] Back → kembali ke daftar channel", listBack);
      await mp.screenshot({ path: `${SHOT_DIR}/chat-mobile-back.png`, fullPage: false });
    }

    // 6. Browser back juga harus menutup chat (popstate)
    await channelItem.click();
    await sleep(2000);
    await mp.goBack();
    await sleep(1200);
    const listAfterBrowserBack = await mp.locator('[data-testid="mobile-channel-list"] p', { hasText: "Direct Messages" }).isVisible().catch(() => false);
    log("[Mobile] Browser back menutup chat (popstate)", listAfterBrowserBack);
  } catch (err) {
    log("[Mobile] Error", false, err.message);
    await mp.screenshot({ path: `${SHOT_DIR}/chat-mobile-error.png` }).catch(() => {});
  } finally {
    await mCtx.close();
  }

  // ========== DESKTOP 1440px ==========
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dCtx.newPage();
  try {
    await login(dp);
    await dp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(4000);
    await dp.screenshot({ path: `${SHOT_DIR}/chat-desktop.png`, fullPage: false });

    log("[Desktop] PageHeader tampil", await dp.locator("h1", { hasText: "Team Chat" }).isVisible().catch(() => false));
    log("[Desktop] Sidebar inline tampil", await dp.locator("div.w-64.border-r").first().isVisible().catch(() => false));
  } catch (err) {
    log("[Desktop] Error", false, err.message);
  } finally {
    await dCtx.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${failed === 0 ? "🎉 SEMUA PASS" : `⚠️ ${failed} GAGAL`} (${results.length - failed}/${results.length})`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});