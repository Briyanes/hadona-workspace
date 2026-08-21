/**
 * Playwright test: Chat tablet 820px — verifikasi breakpoint md→lg
 *
 * Bug sebelum fix: di 768–1024px, bottom nav mobile TAPI chat masih tampil
 * split 2 kolom (sidebar 256px + chat) karena memakai breakpoint md:768px.
 *
 * Setelah fix (chat pakai lg:1024px konsisten dengan bottom-nav):
 *   [Tablet 820px]
 *   1. Daftar channel mobile tampil (bukan sidebar desktop)
 *   2. Bottom nav tampil
 *   3. Container full-bleed (x=0, tanpa rounded)
 *   4. Klik channel → chat fullscreen overlay, bottom nav hidden, back berfungsi
 *
 *   [Boundary 1024px]
 *   5. Sidebar desktop tampil, daftar mobile hidden, bottom nav hidden
 *
 * Usage: node scripts/playwright-chat-tablet-test.mjs [baseUrl]
 * Env: TEST_EMAIL, TEST_PASSWORD (fallback default QA)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL || "admin@hadona.id";
const PASSWORD = process.env.TEST_PASSWORD || "@Yogyakarta2026";
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

  // ========== TABLET 820x1180 (zona bug: 768–1024px) ==========
  const VW = 820, VH = 1180;
  const tCtx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const tp = await tCtx.newPage();
  try {
    await login(tp);
    await tp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);
    await tp.screenshot({ path: `${SHOT_DIR}/chat-tablet-820.png`, fullPage: false });

    // 1. Mobile list tampil, sidebar desktop TIDAK (kunci fix md→lg)
    const mobileList = tp.locator('[data-testid="mobile-channel-list"]');
    const desktopSb = tp.locator('[data-testid="desktop-channel-sidebar"]');
    const mlVisible = await mobileList.isVisible().catch(() => false);
    const sbVisible = await desktopSb.isVisible().catch(() => false);
    log("[Tablet] Mobile channel list tampil @820px", mlVisible);
    log("[Tablet] Sidebar desktop tersembunyi @820px", !sbVisible,
      sbVisible ? "MASIH TAMPIL — fix lg belum aktif!" : "");

    // 2. Bottom nav tampil
    const navSel = 'nav[aria-label="Mobile bottom navigation"]';
    log("[Tablet] Bottom nav tampil @820px",
      await tp.locator(navSel).isVisible().catch(() => false));

    // 3. Full-bleed: container x=0 + tanpa rounded
    const container = tp.locator('[class*="100dvh-64px"]').first();
    if ((await container.count()) > 0) {
      const box = await container.boundingBox();
      const style = await container.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderRadius };
      });
      const flush = box && Math.round(box.x) === 0 && Math.round(box.x + box.width) === VW;
      log("[Tablet] Full-bleed kiri/kanan (x=0)", !!flush,
        box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "");
      log("[Tablet] Tanpa rounded (bukan kotak)", style.radius === "0px", `radius=${style.radius}`);
    } else {
      log("[Tablet] Full-bleed kiri/kanan (x=0)", false, "container tidak ditemukan");
    }

    // 4. Fullscreen chat + back
    const channelItem = tp.locator('[data-testid="mobile-channel-list"] div.flex.flex-col.gap-0\\.5 button').first();
    if ((await channelItem.count()) > 0) {
      await channelItem.click();
      await sleep(2500);
      await tp.screenshot({ path: `${SHOT_DIR}/chat-tablet-820-open.png`, fullPage: false });
      const backBtn = tp.locator('button[aria-label="Kembali ke daftar channel"]');
      const backVisible = await backBtn.isVisible().catch(() => false);
      log("[Tablet] Chat fullscreen + tombol back", backVisible);
      log("[Tablet] Bottom nav hidden saat chat fullscreen",
        (await tp.locator(navSel).count()) === 0);
      if (backVisible) {
        await backBtn.click();
        await sleep(1200);
        log("[Tablet] Back → daftar channel",
          await tp.locator('[data-testid="mobile-channel-list"] p', { hasText: "Direct Messages" }).isVisible().catch(() => false));
      }
    } else {
      log("[Tablet] Chat fullscreen + tombol back", false, "channel tidak ditemukan");
    }
  } catch (e) {
    log("[Tablet] Setup", false, e.message);
  } finally {
    await tCtx.close();
  }

  // ========== BOUNDARY 1024px (desktop mulai) ==========
  const dCtx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const dp = await dCtx.newPage();
  try {
    await login(dp);
    await dp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(4000);
    await dp.screenshot({ path: `${SHOT_DIR}/chat-desktop-1024.png`, fullPage: false });
    log("[1024px] Sidebar desktop tampil",
      await dp.locator('[data-testid="desktop-channel-sidebar"]').isVisible().catch(() => false));
    log("[1024px] Mobile list hidden",
      !(await dp.locator('[data-testid="mobile-channel-list"]').isVisible().catch(() => false)));
    log("[1024px] Bottom nav hidden (CSS lg:hidden)",
      !(await dp.locator('nav[aria-label="Mobile bottom navigation"]').isVisible().catch(() => false)));
  } catch (e) {
    log("[1024px] Setup", false, e.message);
  } finally {
    await dCtx.close();
    await browser.close();
  }

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(50)}\n${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});