/**
 * Playwright verification — date input mobile overflow fix (clients modal).
 *
 * Fix yang diverifikasi:
 *   src/app/(dashboard)/clients/page.tsx — "Mulai/Akhir Kontrak" grid
 *   `grid grid-cols-2 gap-2`  →  `grid gap-2 sm:grid-cols-2`
 *   (mobile = 1 kolom, input date tidak lagi terpotong di track ~130px)
 *
 * Cara pakai:
 *   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-verify-date-input-mobile.mjs
 *   BASE_URL default: http://localhost:3000
 *
 * Cek yang dilakukan per viewport (375x812, 390x844):
 *   1. Modal "Client Baru" terbuka
 *   2. Input date "Mulai Kontrak" & "Akhir Kontrak" terlihat
 *   3. Tidak ada horizontal overflow pada modal container (scrollWidth <= clientWidth + 1)
 *   4. Lebar input date >= 200px (nyaman untuk touch)
 *   5. Tidak ada element keluar viewport kanan
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "❌ TEST_EMAIL dan TEST_PASSWORD wajib diset:\n" +
      "   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-verify-date-input-mobile.mjs"
  );
  process.exit(1);
}

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
];

const SHOT_DIR = path.join(process.cwd(), "scripts", "screenshots");
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Tunggu keluar dari halaman login (dashboard redirect)
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForTimeout(2000);
}

async function verifyViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const r = { viewport: vp.name, pass: true, issues: [] };

  try {
    await login(page);

    // Buka halaman clients
    await page.goto(`${BASE_URL}/clients`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500);

    // Buka modal "Client Baru"
    const newBtn = page.getByRole("button", { name: /new client/i });
    await newBtn.waitFor({ timeout: 10000 });
    await newBtn.click();
    await page.waitForTimeout(1000);

    // Scroll modal ke bagian Kontrak supaya date input terlihat
    const startDateLabel = page.getByText("Mulai Kontrak", { exact: false });
    await startDateLabel.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);

    // Ambil kedua input date
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();
    if (count < 2) {
      r.pass = false;
      r.issues.push(`Expected >=2 date inputs, found ${count}`);
    }

    for (let i = 0; i < count; i++) {
      const input = dateInputs.nth(i);
      const box = await input.boundingBox();
      const label = i === 0 ? "Mulai Kontrak" : "Akhir Kontrak";

      if (!box) {
        r.pass = false;
        r.issues.push(`${label}: tidak terlihat (no boundingBox)`);
        continue;
      }

      // Cek lebar — setelah fix, mobile = 1 kolom penuh (>= ~300px)
      if (box.width < 200) {
        r.pass = false;
        r.issues.push(`${label}: lebar ${Math.round(box.width)}px < 200px (masih 2 kolom?)`);
      }

      // Cek tidak keluar viewport kanan
      if (box.x + box.width > vp.width + 1) {
        r.pass = false;
        r.issues.push(`${label}: keluar viewport (x+w=${Math.round(box.x + box.width)} > ${vp.width})`);
      }
    }

    // Cek horizontal overflow pada modal container & document
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const docOverflow = doc.scrollWidth - doc.clientWidth;
      const modalOverflows = [];
      // Modal pakai [role=dialog] atau container scrollable terdalam
      document.querySelectorAll('[role="dialog"], [data-radix-dialog-content], .max-h-\\[85vh\\]').forEach((el) => {
        const sw = el.scrollWidth, cw = el.clientWidth;
        if (sw > cw + 1) modalOverflows.push({ cls: el.className.slice(0, 60), sw, cw });
      });
      return { docOverflow, modalOverflows };
    });

    if (overflow.docOverflow > 1) {
      r.pass = false;
      r.issues.push(`Document horizontal overflow: ${overflow.docOverflow}px`);
    }
    for (const m of overflow.modalOverflows) {
      r.pass = false;
      r.issues.push(`Modal overflow (${m.cls}): scrollW=${m.sw} clientW=${m.cw}`);
    }

    await page.screenshot({
      path: path.join(SHOT_DIR, `date-input-${vp.name}.png`),
      fullPage: false,
    });
  } catch (err) {
    r.pass = false;
    r.issues.push(`Exception: ${err.message}`);
  }

  // Console errors (abaikan noise network supabase/sockjs umum)
  const relevantErrors = consoleErrors.filter(
    (e) => !/sockjs|net::|Failed to load resource|401|403|ERR_/.test(e)
  );
  if (relevantErrors.length > 0) {
    r.issues.push(`Console errors: ${relevantErrors.slice(0, 3).join(" | ")}`);
  }

  await context.close();
  return r;
}

(async () => {
  console.log("🚀 Verifikasi date-input mobile fix (clients modal)\n");
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const r = await verifyViewport(browser, vp);
    results.push(r);
    const status = r.pass ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}  ${r.viewport}`);
    r.issues.forEach((i) => console.log(`   ⚠️  ${i}`));
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    failed.length === 0
      ? "🎉 SEMUA VIEWPORT PASS — date input tidak overflow di mobile"
      : `❌ ${failed.length}/${results.length} viewport FAIL`
  );

  process.exit(failed.length === 0 ? 0 : 1);
})();