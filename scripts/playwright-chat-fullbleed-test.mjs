/**
 * Playwright test: Chat full-bleed mobile (tanpa "kotak" padding) + regresi desktop
 *
 * Verifikasi perubahan:
 * - DashboardShell: main p-0 khusus /chat (mobile), desktop tetap p-6
 * - Chat page: container h-[calc(100dvh-64px)] di mobile (header h-16 sticky)
 *
 * Mobile 375px:
 *   1. Container chat menyentuh tepi kiri/kanan/bawah viewport (full-bleed, x=0)
 *   2. Container mulai tepat di bawah header (y ≈ 64)
 *   3. Tinggi container ≈ viewport - 64 (tidak ada gap bawah / overflow scroll)
 *   4. Sudut TIDAK rounded di mobile (borderRadius = 0)
 *   5. Bottom nav hidden, fullscreen chat + tombol back tetap berfungsi
 *
 * Desktop 1440px (regresi):
 *   1. PageHeader "Team Chat" tampil
 *   2. Container tetap rounded-xl + border (kotak card seperti sebelumnya)
 *   3. Container tidak menempel tepi (x > sidebar width)
 *
 * Usage: node scripts/playwright-chat-fullbleed-test.mjs [baseUrl]
 * Env: TEST_EMAIL, TEST_PASSWORD (fallback default QA)
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";
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

  // ========== MOBILE 375x812 ==========
  const VW = 375, VH = 812;
  const mCtx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const mp = await mCtx.newPage();
  try {
    await login(mp);
    await mp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);
    await mp.screenshot({ path: `${SHOT_DIR}/chat-fullbleed-mobile.png`, fullPage: false });

    const container = mp.locator('[class*="100dvh-64px"]').first();
    const hasContainer = (await container.count()) > 0;
    log("[Mobile] Container 100dvh-64px ada (padding main hilang)", hasContainer);

    if (hasContainer) {
      const box = await container.boundingBox();
      const style = await container.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderRadius, border: cs.borderWidth };
      });

      // Full-bleed: menempel kiri & kanan viewport
      const flushX = box && Math.round(box.x) === 0 && Math.round(box.x + box.width) === VW;
      log("[Mobile] Full-bleed kiri/kanan (x=0, w=viewport)", !!flushX,
        box ? `x=${Math.round(box.x)} w=${Math.round(box.width)}` : "");

      // Mulai tepat di bawah header sticky h-16 (64px)
      const belowHeader = box && Math.abs(box.y - 64) <= 2;
      log("[Mobile] Mulai tepat di bawah header (y≈64)", !!belowHeader,
        box ? `y=${Math.round(box.y)}` : "");

      // Tinggi = viewport - 64 (tanpa gap bawah, tanpa pb ekstra)
      const heightOk = box && Math.abs(box.height - (VH - 64)) <= 4;
      log("[Mobile] Tinggi = viewport-64 (tanpa gap bawah)", !!heightOk,
        box ? `h=${Math.round(box.height)} (ekspektasi ${VH - 64})` : "");

      // Tidak ada rounded corner / border di mobile (bukan "kotak")
      const flat = style.radius === "0px" && style.border === "0px";
      log("[Mobile] Tanpa rounded/border (bukan kotak)", flat, `radius=${style.radius}`);
    }

    // Bottom nav TAMPIL di daftar channel (hanya hidden saat chat fullscreen terbuka)
    const navSel = 'nav[aria-label="Mobile bottom navigation"]';
    log("[Mobile] Bottom nav tampil di daftar channel",
      await mp.locator(navSel).isVisible().catch(() => false));

    // Header list "Chat" tampil
    log("[Mobile] Header 'Chat' tampil",
      await mp.locator('[data-testid="mobile-channel-list"] h2', { hasText: "Chat" }).isVisible().catch(() => false));

    // Fullscreen chat + back tetap berfungsi
    const channelItem = mp.locator('[data-testid="mobile-channel-list"] div.flex.flex-col.gap-0\\.5 button').first();
    if ((await channelItem.count()) > 0) {
      await channelItem.click();
      await sleep(2500);
      await mp.screenshot({ path: `${SHOT_DIR}/chat-fullbleed-mobile-open.png`, fullPage: false });
      const backBtn = mp.locator('button[aria-label="Kembali ke daftar channel"]');
      log("[Mobile] Chat fullscreen + tombol back", await backBtn.isVisible().catch(() => false));

      // Saat chat fullscreen terbuka → bottom nav harus HIDDEN
      log("[Mobile] Bottom nav hidden saat chat fullscreen",
        (await mp.locator(navSel).count()) === 0);

      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click();
        await sleep(1200);
        log("[Mobile] Back → daftar channel",
          await mp.locator('[data-testid="mobile-channel-list"] p', { hasText: "Direct Messages" }).isVisible().catch(() => false));

        // Kembali ke daftar channel → bottom nav TAMPIL lagi
        log("[Mobile] Bottom nav tampil lagi setelah back",
          await mp.locator(navSel).isVisible().catch(() => false));
      }
    } else {
      log("[Mobile] Chat fullscreen + tombol back", false, "channel tidak ditemukan");
    }
  } catch (err) {
    log("[Mobile] Error", false, err.message);
    await mp.screenshot({ path: `${SHOT_DIR}/chat-fullbleed-mobile-error.png` }).catch(() => {});
  } finally {
    await mCtx.close();
  }

  // ========== DESKTOP 1440x900 (regresi) ==========
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dCtx.newPage();
  try {
    await login(dp);
    await dp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(4000);
    await dp.screenshot({ path: `${SHOT_DIR}/chat-fullbleed-desktop.png`, fullPage: false });

    log("[Desktop] PageHeader tampil", await dp.locator("h1", { hasText: "Team Chat" }).isVisible().catch(() => false));
    log("[Desktop] Sidebar inline tampil", await dp.locator("div.w-64.border-r").first().isVisible().catch(() => false));

    const dContainer = dp.locator('[class*="100vh-180px"]').first();
    if ((await dContainer.count()) > 0) {
      const box = await dContainer.boundingBox();
      const style = await dContainer.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { radius: cs.borderRadius, border: cs.borderWidth };
      });
      const padded = box && box.x > 250; // sidebar 240 + p-6
      log("[Desktop] Container tetap padding (tidak menempel)", !!padded,
        box ? `x=${Math.round(box.x)}` : "");
      const card = style.radius !== "0px" && style.border !== "0px";
      log("[Desktop] Tetap rounded + border (card)", card, `radius=${style.radius}`);
    } else {
      log("[Desktop] Container ditemukan", false, "selector 100vh-180px tidak match");
    }
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