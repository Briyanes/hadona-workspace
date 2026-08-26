/**
 * Verifikasi fix: /chat mobile — list channel harus full-width, TIDAK ada panel kosong di kanan
 * Bug: center div (flex-1) ikut render di mobile walau kosong → list hanya 50% kiri, kanan kosong
 * Fix: center div diberi `hidden lg:flex` saat !mobileChatOpen && !inCallRoom
 *
 * Test:
 * 1. Mobile 390px state awal: mobile-channel-list width ≈ viewport (≥95%), center div display none
 * 2. Klik channel → chat fullscreen muncul (input pesan tampil), list hidden
 * 3. Tombol back → list kembali full-width
 * 4. Tablet 820px (<lg): behavior sama seperti mobile
 * 5. Desktop 1440px: center div tampil (regression)
 *
 * Usage: node scripts/verify-chat-mobile-list-fix.mjs [baseUrl]
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

// Ukur geometri list mobile + center div
async function measure(page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="mobile-channel-list"]');
    const listRect = list ? list.getBoundingClientRect() : null;
    // Center div = anak terakhir dari container utama (relative flex)
    const center = document.querySelector(".relative.flex")?.querySelector(":scope > div:last-child");
    const centerDisplay = center ? getComputedStyle(center).display : "not-found";
    return {
      viewportW: window.innerWidth,
      listW: listRect ? Math.round(listRect.width) : 0,
      centerDisplay,
    };
  });
}

async function testViewport(browser, width, height, label) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  try {
    await login(page);
    await page.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);

    // === State awal: list harus dominan full-width, center div hidden ===
    let m = await measure(page);
    log(`[${label}] List channel ~full-width`, m.listW >= width * 0.95, `listW=${m.listW}, vw=${m.viewportW}`);
    log(`[${label}] Panel kanan kosong TIDAK tampil`, m.centerDisplay === "none", `display=${m.centerDisplay}`);
    await page.screenshot({ path: `${SHOT_DIR}/chat-fix-${label}-initial.png` });

    // === Klik channel pertama → chat fullscreen ===
    const firstChannel = page.locator('[data-testid="mobile-channel-list"] button').first();
    if (await firstChannel.count() === 0) {
      log(`[${label}] Klik channel → chat terbuka`, false, "tidak ada channel");
    } else {
      await firstChannel.click();
      await sleep(3000);
      const chatInput = page.locator("textarea");
      const chatVisible = await chatInput.isVisible().catch(() => false);
      log(`[${label}] Klik channel → chat terbuka`, chatVisible);
      const mOpen = await measure(page);
      log(`[${label}] Chat fullscreen: list hidden`, mOpen.listW === 0, `listW=${mOpen.listW}`);
      await page.screenshot({ path: `${SHOT_DIR}/chat-fix-${label}-open.png` });

      // === Tombol back → kembali ke list full-width ===
      const backBtn = page.locator('button[aria-label="Kembali ke daftar channel"]');
      if (await backBtn.count() > 0) {
        await backBtn.click();
        await sleep(1500);
        const mBack = await measure(page);
        log(`[${label}] Back → list kembali full-width`, mBack.listW >= width * 0.95, `listW=${mBack.listW}`);
        log(`[${label}] Back → panel kanan hidden lagi`, mBack.centerDisplay === "none", `display=${mBack.centerDisplay}`);
        await page.screenshot({ path: `${SHOT_DIR}/chat-fix-${label}-back.png` });
      } else {
        log(`[${label}] Tombol back tersedia`, false, "tombol back tidak ditemukan");
      }
    }
  } catch (err) {
    log(`[${label}] Halaman /chat termuat`, false, err.message);
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Mobile 390x844 (scene bug dilaporkan)
  await testViewport(browser, 390, 844, "mobile390");

  // Mobile 375 (regression test lama)
  await testViewport(browser, 375, 812, "mobile375");

  // Tablet 820x1180 (juga <lg — bug sama terjadi sebelum fix)
  await testViewport(browser, 820, 1180, "tablet820");

  // Desktop 1440: center div HARUS tetap tampil (regression)
  const dCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dp = await dCtx.newPage();
  try {
    await login(dp);
    await dp.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);
    const md = await measure(dp);
    log("[Desktop] Center chat area tetap tampil (lg:flex)", md.centerDisplay !== "none", `display=${md.centerDisplay}`);
    // App auto-select channel pertama (useEffect line ~1781), jadi center panel
    // harusnya menampilkan chat aktif dengan input pesan, bukan empty state
    const chatInput = dp.locator("textarea").first();
    log("[Desktop] Channel auto-selected, input pesan tampil", await chatInput.isVisible().catch(() => false));
    const sidebar = dp.locator('[data-testid="desktop-channel-sidebar"]');
    log("[Desktop] Sidebar desktop tampil", await sidebar.isVisible().catch(() => false));
  } catch (err) {
    log("[Desktop] Regression desktop", false, err.message);
  } finally {
    await dCtx.close();
  }

  await browser.close();

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n=== HASIL: ${pass}/${results.length} PASS ===`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});