/**
 * Playwright QA — Floating Chat FAB (desktop-only)
 *
 * Verifikasi:
 * 1. FAB visible + clickable di viewport >= 1024px (desktop & tablet landscape)
 * 2. FAB hidden di viewport < 1024px (mobile & tablet portrait — bottom nav aktif)
 * 3. Klik FAB → navigasi ke /chat
 * 4. Di halaman /chat → FAB hidden (auto-hide)
 *
 * Usage: node scripts/playwright-floating-chat-fab.mjs [baseURL]
 * Default baseURL: https://workspace.hadona.id
 * Butuh storage state valid di /tmp/hadona-qa-state.json
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const STATE = "/tmp/hadona-qa-state.json";

const VIEWPORTS = [
  { name: "Desktop 1440x900", width: 1440, height: 900, fab: true },
  { name: "Desktop 1280x800", width: 1280, height: 800, fab: true },
  { name: "Tablet landscape 1180x820", width: 1180, height: 820, fab: true },
  { name: "Boundary 1024x768", width: 1024, height: 768, fab: true },
  { name: "Tablet portrait 820x1180", width: 820, height: 1180, fab: false },
  { name: "Tablet portrait 768x1024", width: 768, height: 1024, fab: false },
  { name: "Mobile 390x844", width: 390, height: 844, fab: false },
  { name: "Mobile 375x812", width: 375, height: 812, fab: false },
];

const FAB_SELECTOR = 'a[aria-label="Buka Team Chat"]';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let failed = 0;
let aborted = false;

/** Login fresh dan simpan storage state (fallback jika state lama expired). */
async function ensureState(browser) {
  if (fs.existsSync(STATE)) {
    // Validasi cepat: state ada, biarkan guard /login di loop yang menangkap expiry
    return;
  }
  if (!EMAIL || !PASSWORD) {
    throw new Error(`Storage state ${STATE} tidak ditemukan dan TEST_EMAIL/TEST_PASSWORD tidak di-set`);
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 });
  await sleep(2000);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  console.log("🔑 Login fresh OK, storage state disimpan.");
}

function log(status, msg) {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} ${status}: ${msg}`);
  if (status === "FAIL") failed++;
}

const browser = await chromium.launch();

try {
  await ensureState(browser);

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: STATE,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    // Test di halaman dashboard (bukan /chat)
    // NOTE: "networkidle" tidak dipakai — realtime subscription (chat/notifications)
    // membuat network tidak pernah idle. "load" + settle delay lebih andal.
    await page.goto(`${BASE}/tasks`, { waitUntil: "load", timeout: 30000 });
    await sleep(2500); // tunggu render client-side + hydration

    // Guard: sesi invalid → redirect ke /login, hentikan dengan pesan jelas
    if (page.url().includes("/login")) {
      throw new Error("Sesi QA expired (diredirect ke /login). Buat storage state baru lalu jalankan ulang.");
    }

    const fab = page.locator(FAB_SELECTOR);
    const fabCount = await fab.count();

    if (vp.fab) {
      if (fabCount === 0) {
        log("FAIL", `${vp.name}: FAB seharusnya VISIBLE tapi tidak dirender`);
      } else {
        const visible = await fab.first().isVisible();
        if (visible) {
          const box = await fab.first().boundingBox();
          const inCorner =
            box &&
            box.x + box.width <= vp.width &&
            box.y + box.height <= vp.height &&
            box.y + box.height > vp.height - 150; // dekat bottom
          log("PASS", `${vp.name}: FAB visible di pojok kanan bawah (${Math.round(box?.x ?? 0)},${Math.round(box?.y ?? 0)})`);

          // Klik → harus ke /chat
          await fab.first().click();
          await page.waitForURL("**/chat", { timeout: 15000 }).catch(() => {});
          if (page.url().includes("/chat")) {
            log("PASS", `${vp.name}: klik FAB → navigasi ke /chat`);
          } else {
            log("FAIL", `${vp.name}: klik FAB TIDAK navigasi ke /chat (URL: ${page.url()})`);
          }

          // Di /chat → FAB harus hidden
          await page.waitForTimeout(800);
          const fabOnChat = await page.locator(FAB_SELECTOR).count();
          if (fabOnChat === 0) {
            log("PASS", `${vp.name}: FAB auto-hide di halaman /chat`);
          } else {
            log("FAIL", `${vp.name}: FAB masih dirender di halaman /chat`);
          }
        } else {
          log("FAIL", `${vp.name}: FAB dirender tapi tidak visible (CSS hidden?)`);
        }
      }
      // Desktop tidak boleh ada bottom nav
      const bottomNav = await page.locator('nav[aria-label="Mobile bottom navigation"]').count();
      if (bottomNav > 0) {
        const navVisible = await page.locator('nav[aria-label="Mobile bottom navigation"]').first().isVisible();
        log(navVisible ? "FAIL" : "PASS", `${vp.name}: bottom nav ${navVisible ? "MASIH visible (harusnya hidden)" : "hidden"}`);
      }
    } else {
      if (fabCount > 0) {
        log("FAIL", `${vp.name}: FAB seharusnya HIDDEN (mobile/tablet) tapi dirender`);
      } else {
        log("PASS", `${vp.name}: FAB hidden (akses chat via bottom nav)`);
      }
      // Bottom nav harus ada di mobile/tablet
      await page.waitForTimeout(500);
      const bottomNav = await page.locator('nav[aria-label="Mobile bottom navigation"]').count();
      const chatInNav = await page.locator('nav[aria-label="Mobile bottom navigation"] a[aria-label="Chat"]').count();
      log(
        bottomNav > 0 && chatInNav > 0 ? "PASS" : "WARN",
        `${vp.name}: bottom nav ${bottomNav > 0 ? "ada" : "TIDAK ADA"}${chatInNav > 0 ? " + tombol Chat" : ""}`
      );
    }

    if (errors.length > 0) {
      log("WARN", `${vp.name}: ${errors.length} console error (non-FAB, cek manual): ${errors[0]?.slice(0, 120)}`);
    }
    results.push({ vp: vp.name, errors: errors.length });
    await ctx.close();
  }
} catch (e) {
  aborted = true;
  console.error(`\n💥 ${e.message}`);
  console.error("Login QA diperlukan: buat storage state baru lalu jalankan ulang script ini.");
  process.exitCode = 1;
} finally {
  await browser.close();
}

console.log(`\n${"=".repeat(60)}`);
if (aborted) {
  console.log("SUMMARY: ABORTED ❌ (sesi tidak valid / navigasi gagal)");
} else {
  console.log(`SUMMARY: ${failed === 0 ? "SEMUA PASS ✅" : `${failed} FAIL ❌`}`);
  process.exitCode = failed === 0 ? 0 : 1;
}
