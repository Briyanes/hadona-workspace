/**
 * Playwright verification — batch responsive form-grid fix (G7 batch).
 *
 * Fix yang diverifikasi (grid fixed → mobile 1 kolom, sm+ multi kolom):
 *   1. src/app/(dashboard)/invoices/page.tsx L789            (3 kolom: dates/selects)
 *   2. src/app/(dashboard)/strategy/page.tsx L857            (3 kolom OKR form)
 *   3. src/components/ads-spend/spend-log-modal.tsx L87       (3 kolom spend log)
 *   4. src/components/reports/goal-tracker.tsx L198           (3 kolom add-goal form)
 *   5. src/components/reports/email-schedule-manager.tsx L181+L209 (2 kolom schedule)
 *
 * Cara pakai:
 *   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-verify-grid-mobile.mjs
 *   BASE_URL default: http://localhost:3000
 *
 * Cek per viewport (375x812, 390x844):
 *   1. Modal terbuka via tombol toolbar
 *   2. Semua input/select/textarea dalam modal: width >= 150px (layak touch)
 *   3. Tidak ada horizontal overflow (doc.scrollWidth <= innerWidth + 1)
 *   4. Tidak ada elemen form keluar viewport kanan
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
      "   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-verify-grid-mobile.mjs"
  );
  process.exit(1);
}

const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
];

const MIN_INPUT_W = 150; // layak touch; track lama ~110px gagal

const SHOT_DIR = path.join(process.cwd(), "scripts", "screenshots");
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForTimeout(2000);
}

/**
 * Audit elemen form di dalam modal terbuka.
 * Return { issues: string[], minW: number }
 */
async function auditForm(page, label) {
  const audit = await page.evaluate((minW) => {
    const modal = document.querySelector('[role="dialog"]') || document.body;
    const fields = modal.querySelectorAll("input, select, textarea");
    const issues = [];
    let minW = Infinity;
    fields.forEach((el) => {
      if (el.offsetParent === null) return; // hidden
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      minW = Math.min(minW, r.width);
      if (r.width < minW) {
        issues.push(
          `${el.tagName.toLowerCase()}[${el.type || el.name || ""}] width=${Math.round(r.width)}px (min ${minW})`
        );
      }
      if (r.right > window.innerWidth + 1) {
        issues.push(`${el.tagName.toLowerCase()} overflow kanan: right=${Math.round(r.right)}`);
      }
    });
    return { issues, minW: minW === Infinity ? 0 : Math.round(minW), count: fields.length };
  }, MIN_INPUT_W);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );

  return {
    issues: audit.issues,
    overflow,
    minW: audit.minW,
    count: audit.count,
    pass: audit.issues.length === 0 && overflow <= 1,
    label,
  };
}

async function openAndAudit(page, vp, shotName, openModal) {
  try {
    await openModal();
    await page.waitForTimeout(700);
    const res = await auditForm(page, shotName);
    await page.screenshot({
      path: path.join(SHOT_DIR, `${vp.name}-${shotName}.png`),
      fullPage: false,
    });
    return res;
  } catch (err) {
    return { label: shotName, pass: false, issues: [`ERROR: ${err.message.split("\n")[0]}`], minW: 0, count: 0, overflow: 99 };
  }
}

async function verifyViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)));

  await login(page);
  const local = [];

  // 1. Invoices — "New Invoice"
  await page.goto(`${BASE_URL}/invoices`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  local.push(
    await openAndAudit(page, vp, "invoices-new", async () => {
      await page.getByRole("button", { name: /New Invoice/i }).first().click();
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    })
  );

  // 2. Strategy — "Buat OKR"
  await page.goto(`${BASE_URL}/strategy`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);
  local.push(
    await openAndAudit(page, vp, "strategy-okr", async () => {
      await page.getByRole("button", { name: /Buat OKR/i }).first().click();
      await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    })
  );

  // 3. Ads Spend — "Log Spend Harian"
  await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 40000 });
  await page.waitForTimeout(2500);
  local.push(
    await openAndAudit(page, vp, "ads-spend-log", async () => {
      await page.getByTitle("Log Spend Harian").first().click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    })
  );

  // 4. Reports — "Add Goal" (goal tracker form inline)
  await page.goto(`${BASE_URL}/reports`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);
  local.push(
    await openAndAudit(page, vp, "reports-addgoal", async () => {
      const btn = page.getByRole("button", { name: /Add Goal/i }).first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(500);
    })
  );

  // 5. Reports — "Add Schedule" (email schedule manager)
  local.push(
    await openAndAudit(page, vp, "reports-addschedule", async () => {
      const btn = page.getByRole("button", { name: /Add Schedule/i }).first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(500);
    })
  );

  results.push({ vp: vp.name, checks: local, consoleErrors });
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) await verifyViewport(browser, vp);
  await browser.close();

  console.log("\n================ HASIL VERIFIKASI GRID MOBILE ================\n");
  let fail = 0;
  let warn = 0;
  for (const r of results) {
    console.log(`\n[${r.vp}]`);
    for (const c of r.checks) {
      const status = c.pass ? "PASS" : "FAIL";
      if (!c.pass) fail++;
      console.log(
        `  ${status === "PASS" ? "✅" : "❌"} ${c.label.padEnd(20)} ${status} | minInput=${c.minW}px | fields=${c.count} | hOverflow=${c.overflow}px`
      );
      c.issues.forEach((i) => console.log(`       └─ ${i}`));
    }
    if (r.consoleErrors.length) {
      warn++;
      console.log(`  ⚠️  console errors: ${r.consoleErrors.length}`);
      r.consoleErrors.slice(0, 3).forEach((e) => console.log(`       └─ ${e}`));
    }
  }
  console.log(
    `\nRINGKASAN: ${fail === 0 ? "✅ SEMUA PASS" : `❌ ${fail} FAIL`} | console-error contexts: ${warn}\n`
  );
  process.exit(fail === 0 ? 0 : 1);
})();