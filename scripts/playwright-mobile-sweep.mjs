/**
 * Playwright test: Mobile sweep 390x844 — audit SEMUA halaman utama di mobile
 *
 * Per halaman dicek:
 *   1. Halaman termuat tanpa error boundary
 *   2. Tidak ada horizontal overflow (scrollWidth ≤ viewport +2px)
 *   3. Bottom nav mobile tampil & tidak menutupi konten interaktif terakhir
 *   4. Sidebar desktop tersembunyi (lg:hidden)
 *
 * Usage: node scripts/playwright-mobile-sweep.mjs [baseUrl]
 * Env: TEST_EMAIL, TEST_PASSWORD
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL || "admin@hadona.id";
const PASSWORD = process.env.TEST_PASSWORD || "@Yogyakarta2026";
const VW = 390, VH = 844;
const SHOT_DIR = "scripts/screenshots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  { path: "/", name: "Dashboard" },
  { path: "/tasks", name: "Tasks" },
  { path: "/chat", name: "Chat" },
  { path: "/content-plans", name: "Content Plans" },
  { path: "/content-studio", name: "Content Studio" },
  { path: "/production", name: "Production" },
  { path: "/creative", name: "Creative" },
  { path: "/reports", name: "Reports" },
  { path: "/clients", name: "Clients" },
  { path: "/calendar", name: "Calendar" },
  { path: "/strategy", name: "Strategy" },
  { path: "/invoices", name: "Invoices" },
  { path: "/ads-spend", name: "Ads Spend" },
];

const results = [];
const log = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // Login sekali
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  // Redirect login mobile bisa >4s — tunggu URL berubah, bukan sleep tetap
  await page
    .waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 })
    .catch(() => {});
  await sleep(2000);
  if (page.url().includes("/login")) {
    console.error("FATAL: LOGIN GAGAL");
    await page.screenshot({ path: `${SHOT_DIR}/mobile-sweep-login-fail.png` });
    await browser.close();
    process.exit(1);
  }
  console.log(`Login OK → ${page.url()}\n`);

  const navSel = 'nav[aria-label="Mobile bottom navigation"]';

  for (const p of PAGES) {
    console.log(`\n=== ${p.name} (${p.path}) ===`);
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 30000 });
      await sleep(3500);
      await page.screenshot({ path: `${SHOT_DIR}/mobile-390-${p.path.replace(/\//g, "_") || "root"}.png` });
      // Scroll ke bawah penuh dulu — elemen di belakang nav pada scroll=0 masih bisa
      // di-scroll dan BUKAN bug; bug nyata = tetap tertutup setelah scroll max
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

      // 1. Error boundary / halaman error?
      const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 3000);
      const hasError = /something went wrong|terjadi kesalahan|application error|internal server error/i.test(bodyText);
      log(`[${p.name}] Termuat tanpa error`, !hasError);

      // 2. Horizontal overflow
      const metrics = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      log(`[${p.name}] Tanpa horizontal overflow`, metrics.sw <= metrics.cw + 2,
        `scrollW=${metrics.sw} clientW=${metrics.cw}`);

      // 3. Bottom nav tampil (kecuali chat fullscreen yang menyembunyikan nav — halaman list harus tampil)
      log(`[${p.name}] Bottom nav tampil`,
        await page.locator(navSel).isVisible().catch(() => false));

      // 4. Sidebar desktop tersembunyi — cek overlap rect dengan viewport
      //    (isVisible() true untuk off-canvas -translate-x-full padahal di luar layar)
      const sidebarVisible = await page
        .evaluate(() => {
          const el = document.querySelector("aside, [data-sidebar]");
          if (!el) return false;
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden") return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > 0 && r.left < window.innerWidth;
        })
        .catch(() => false);
      log(`[${p.name}] Sidebar desktop hidden`, !sidebarVisible);

      // 5. Bottom nav tidak overlap konten: elemen klik-able terakhir di bawah nav?
      const overlap = await page.evaluate((sel) => {
        const nav = document.querySelector(sel);
        if (!nav) return null;
        const nr = nav.getBoundingClientRect();
        const els = [...document.querySelectorAll("button, a, input, select, textarea")];
        const covered = [];
        for (const el of els) {
          if (nav.contains(el)) continue;
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || st.pointerEvents === "none") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // overlap 2 arah (vertikal & horizontal) dengan rect nav
          const vO = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top);
          const hO = Math.min(r.right, nr.right) - Math.max(r.left, nr.left);
          if (vO > 4 && hO > 4) {
            // elemen benar2 tak terjangkau? cek apakah masih bisa discroll ke atas nav
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            const canScrollMore = window.scrollY < maxScroll - 2;
            if (!canScrollMore) covered.push((el.textContent || "").trim().slice(0, 25));
          }
        }
        return covered;
      }, navSel).catch(() => null);
      log(`[${p.name}] Konten tidak tertutup bottom nav`, overlap === null || overlap.length === 0,
        overlap && overlap.length ? `${overlap.length} tertutup: ${overlap.slice(0, 3).join(" | ")}` : "");
    } catch (e) {
      log(`[${p.name}] Setup`, false, e.message.slice(0, 80));
    }
  }

  await ctx.close();
  await browser.close();

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(50)}\n${pass}/${results.length} PASS`);
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});