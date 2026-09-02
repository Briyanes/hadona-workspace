/**
 * Playwright MOBILE MODAL AUDIT — 375x812 & 390x844
 *
 * Audit menyeluruh semua menu dashboard di mobile:
 *   1. Buka setiap halaman → cek horizontal overflow
 *   2. Klik tombol aksi (Tambah/Baru/Import/dll) → buka modal
 *   3. Klik baris tabel / kartu pertama → buka modal detail
 *   4. Per modal dicek:
 *      a. Tidak ada horizontal overflow (scrollWidth ≤ clientWidth+1)
 *      b. input[type=date] lebar ≥ 160px (layak touch, tidak terpotong)
 *      c. Tidak ada elemen keluar viewport kiri/kanan
 *      d. Tidak ada teks terpotong (scrollWidth > clientWidth tanpa truncate)
 *   5. Screenshot per modal → scripts/screenshots/mobile-modal-audit/
 *
 * Usage:
 *   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-mobile-modal-audit.mjs [baseUrl]
 *   BASE default: https://workspace.hadona.id (atau http://localhost:3000)
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = process.argv[2] || (process.env.BASE_URL || "https://workspace.hadona.id");
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SHOT_DIR = "scripts/screenshots/mobile-modal-audit";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!EMAIL || !PASSWORD) {
  console.error("❌ Set TEST_EMAIL & TEST_PASSWORD env dulu");
  process.exit(1);
}

const VIEWPORTS = [
  { name: "375", w: 375, h: 812 },
  { name: "390", w: 390, h: 844 },
];

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
  { path: "/approvals", name: "Approvals" },
  { path: "/leads", name: "Leads" },
  { path: "/timesheet", name: "Timesheet" },
  { path: "/monthly-reports", name: "Monthly Reports" },
  { path: "/brand-kits", name: "Brand Kits" },
  { path: "/users", name: "Users" },
  { path: "/settings/integrations", name: "Settings Integrations" },
];

// Tombol aksi pembuka modal (case-insensitive)
const ACTION_BTN = /(tambah|buat|baru|create|new|import|upload|log|ajukan|generate|share|sync|token|account|event|absen|clock|request|edit|lihat|detail|view)/i;

const results = [];
const log = (sev, page, item, extra = "") => {
  results.push({ sev, page, item, extra });
  const icon = sev === "FAIL" ? "❌" : sev === "WARN" ? "⚠️ " : "✅";
  console.log(`${icon} [${page}] ${item}${extra ? ` — ${extra}` : ""}`);
};

/** Audit sebuah modal yang sedang terbuka */
async function auditModal(page, pageName, modalLabel, vpName) {
  const dialog = page.locator('[role="dialog"]').first();
  if (!(await dialog.isVisible().catch(() => false))) return false;

  // a) Horizontal overflow pada dialog
  const overflow = await dialog.evaluate((el) => {
    const bad = [];
    if (el.scrollWidth > el.clientWidth + 1)
      bad.push(`dialog scrollW=${el.scrollWidth} clientW=${el.clientWidth}`);
    // c) elemen keluar viewport
    const vw = window.innerWidth;
    const inHScroll = (n) => {
      let p = n.parentElement;
      while (p && p !== document.body) {
        const st = getComputedStyle(p);
        if ((st.overflowX === "auto" || st.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 1) return true;
        p = p.parentElement;
      }
      return false;
    };
    const all = el.querySelectorAll("*");
    let out = 0;
    for (const n of all) {
      const r = n.getBoundingClientRect();
      const st = getComputedStyle(n);
      if (st.display === "none" || st.visibility === "hidden" || r.width === 0) continue;
      // dekoratif (blur/absolute offset sengaja) di-skip
      if (st.position === "absolute" && st.filter.includes("blur")) continue;
      if (inHScroll(n)) continue; // dalam scroll-container horizontal by design
      if (r.right > vw + 1 || r.left < -1) out++;
    }
    if (out > 0) bad.push(`${out} elemen keluar viewport`);
    return bad;
  });
  if (overflow.length) log("FAIL", pageName, `modal:${modalLabel} (${vpName})`, overflow.join("; "));
  else log("PASS", pageName, `modal:${modalLabel} (${vpName}) overflow-check`);

  // b) Date input terlalu sempit
  const dateInputs = page.locator('[role="dialog"] input[type="date"]');
  const nDate = await dateInputs.count();
  for (let i = 0; i < nDate; i++) {
    const w = await dateInputs.nth(i).boundingBox();
    if (w && w.width < 160) {
      log("FAIL", pageName, `modal:${modalLabel} (${vpName}) date-input sempit`, `lebar ${Math.round(w.width)}px (<160px)`);
    }
  }

  // d) Teks terpotong: scrollWidth > clientWidth & tidak truncate/ellipsis
  const clipped = await dialog.evaluate((el) => {
    const bad = [];
    const walk = (node) => {
      for (const n of node.children) {
        const st = getComputedStyle(n);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const hasOwnText = Array.from(n.childNodes).some(
          (c) => c.nodeType === 3 && c.textContent.trim().length > 3
        );
        if (hasOwnText) {
          const clippedNow = n.scrollWidth > n.clientWidth + 3;
          const canWrap = st.whiteSpace !== "nowrap" && st.overflowWrap !== "break-word";
          const truncated = st.textOverflow === "ellipsis" || n.classList.contains("truncate");
          if (clippedNow && !truncated && st.whiteSpace === "nowrap") {
            bad.push(`"${n.textContent.trim().slice(0, 30)}" sw=${n.scrollWidth} cw=${n.clientWidth}`);
          }
        }
        walk(n);
      }
    };
    walk(el);
    return bad.slice(0, 5);
  });
  if (clipped.length) log("WARN", pageName, `modal:${modalLabel} (${vpName}) text-clip`, clipped.join(" | "));
  return true;
}

async function closeModal(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(300);
  const still = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  if (still) {
    // fallback: klik tombol X
    const x = page.locator('[role="dialog"] button[aria-label*="utup"], [role="dialog"] button:has(svg.lucide-x)').first();
    await x.click().catch(() => {});
    await sleep(300);
  }
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const only = process.env.VIEWPORT; // mis. "390" untuk single-viewport run
  for (const vp of only ? VIEWPORTS.filter((v) => v.name === only) : VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();

    // ---- LOGIN ----
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
    await sleep(1500);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 }).catch(() => {});
    if (page.url().includes("login")) {
      console.error("❌ Login gagal — cek TEST_EMAIL/TEST_PASSWORD");
      process.exit(1);
    }
    console.log(`\n=== VIEWPORT ${vp.w}x${vp.h} — login OK ===`);

    for (const p of PAGES) {
      const pageName = `${p.name}`;
      try {
        await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 45000 });
      } catch {
        log("WARN", pageName, "page-load", "timeout networkidle — lanjut");
      }
      await sleep(1800);

      // page-level overflow
      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (pageOverflow > 2) log("FAIL", pageName, "page-overflow", `+${pageOverflow}px`);

      // kumpulkan tombol kandidat pembuka modal (header & toolbar area, exclude nav)
      const btns = page.locator('button:visible', { hasText: ACTION_BTN });
      const candidates = [];
      const seen = new Set();
      const count = Math.min(await btns.count(), 25);
      for (let i = 0; i < count; i++) {
        const b = btns.nth(i);
        const txt = (await b.innerText().catch(() => "")).trim();
        const bb = await b.boundingBox().catch(() => null);
        if (!txt || !bb || seen.has(txt)) continue;
        seen.add(txt);
        candidates.push({ txt: txt.slice(0, 24), i });
      }

      let modalCount = 0;
      for (const c of candidates) {
        const b = page.locator("button:visible", { hasText: c.txt }).first();
        await b.click({ timeout: 5000 }).catch(() => {});
        await sleep(900);
        const opened = await auditModal(page, pageName, `btn:"${c.txt}"`, vp.name);
        if (opened) {
          modalCount++;
          await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}-${p.name}-${c.txt.replace(/\W+/g, "_")}.png`) }).catch(() => {});
          await closeModal(page);
        }
      }

      // detail modal via baris tabel pertama / kartu
      const row = page.locator("table tbody tr, [data-row], .card").first();
      if (await row.isVisible().catch(() => false)) {
        await row.click({ timeout: 5000 }).catch(() => {});
        await sleep(900);
        const opened = await auditModal(page, pageName, "detail:row-1", vp.name);
        if (opened) {
          modalCount++;
          await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}-${p.name}-detail.png`) }).catch(() => {});
          await closeModal(page);
        }
      }

      log(modalCount > 0 ? "PASS" : "WARN", pageName, "summary", `${modalCount} modal diaudit, ${candidates.length} tombol kandidat`);
    }
    await ctx.close();
  }

  await browser.close();

  // Ringkasan
  const fails = results.filter((r) => r.sev === "FAIL");
  const warns = results.filter((r) => r.sev === "WARN");
  console.log(`\n===== RINGKASAN =====`);
  console.log(`TOTAL: ${results.length} | FAIL: ${fails.length} | WARN: ${warns.length}`);
  if (fails.length) {
    console.log("\n--- FAIL detail ---");
    fails.forEach((f) => console.log(`  [${f.page}] ${f.item} — ${f.extra}`));
  }
  fs.writeFileSync(
    "scripts/screenshots/mobile-modal-audit-results.json",
    JSON.stringify(results, null, 2)
  );
  console.log("\nHasil JSON: scripts/screenshots/mobile-modal-audit-results.json");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});