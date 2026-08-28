/**
 * Playwright verification — "Buat Task Baru" modal: Start Date & Deadline overlap di mobile.
 *
 * Target:
 *   src/components/tasks/task-board/create-task-modal.tsx
 *   Modal title: "Buat Task Baru" — field Start Date (input[type=date])
 *   & Deadline (input[type=date]).
 *
 * Cara pakai:
 *   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-verify-task-dates-mobile.mjs
 *   BASE_URL default: http://localhost:3000
 *
 * Cek yang dilakukan per viewport (375x812, 390x844):
 *   1. Modal "Buat Task Baru" terbuka (klik tombol "New Task" di /tasks)
 *   2. Kedua input date (Start Date & Deadline) terlihat
 *   3. TIDAK ada overlap boundingBox antara Start Date vs Deadline
 *   4. Lebar tiap input date >= 200px (nyaman untuk touch)
 *   5. Tidak ada element keluar viewport kanan
 *   6. Tidak ada horizontal overflow (document & modal container)
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
      "   TEST_EMAIL=... TEST_PASSWORD=... node scripts/playwright-verify-task-dates-mobile.mjs"
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
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForTimeout(2000);
}

/** Cek irisan dua bounding box (overlap area) */
function overlapArea(a, b) {
  if (!a || !b) return 0;
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
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

    // Buka halaman tasks
    await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500);

    // Klik tombol "New Task" untuk membuka modal "Buat Task Baru"
    const newTaskBtn = page.getByRole("button", { name: /new task/i });
    await newTaskBtn.waitFor({ timeout: 10000 });
    await newTaskBtn.click();
    await page.waitForTimeout(1000);

    // Pastikan modal terbuka
    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 5000 });
    const modalTitle = await dialog.locator("#modal-title").textContent().catch(() => "");
    if (!modalTitle.includes("Buat Task Baru")) {
      r.issues.push(`Modal title tak terduga: "${modalTitle}"`);
    }

    // Scroll ke Start Date supaya terlihat
    const startDateLabel = dialog.getByText("Start Date", { exact: true });
    await startDateLabel.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);

    // Ambil kedua input date DI DALAM modal saja
    const dateInputs = dialog.locator('input[type="date"]');
    const count = await dateInputs.count();
    if (count < 2) {
      r.pass = false;
      r.issues.push(`Expected >=2 date inputs di modal, found ${count}`);
    }

    const boxes = [];
    const labels = ["Start Date", "Deadline"];
    for (let i = 0; i < count; i++) {
      const input = dateInputs.nth(i);
      const box = await input.boundingBox();
      const label = labels[i] || `date-input-${i}`;
      if (!box) {
        r.pass = false;
        r.issues.push(`${label}: tidak terlihat (no boundingBox)`);
        continue;
      }
      boxes.push({ label, box });

      // Cek lebar — layak touch
      if (box.width < 200) {
        r.pass = false;
        r.issues.push(`${label}: lebar ${Math.round(box.width)}px < 200px`);
      }

      // Cek tidak keluar viewport kanan
      if (box.x + box.width > vp.width + 1) {
        r.pass = false;
        r.issues.push(`${label}: keluar viewport (x+w=${Math.round(box.x + box.width)} > ${vp.width})`);
      }
    }

    // ⭐ Cek OVERLAP antara Start Date & Deadline
    if (boxes.length === 2) {
      const [a, b] = boxes;
      const ov = overlapArea(a.box, b.box);
      if (ov > 1) {
        r.pass = false;
        r.issues.push(
          `OVERLAP ${a.label} ↔ ${b.label}: ${Math.round(ov)}px² ` +
            `(a=[x:${Math.round(a.box.x)},y:${Math.round(a.box.y)},w:${Math.round(a.box.width)},h:${Math.round(a.box.height)}] ` +
            `b=[x:${Math.round(b.box.x)},y:${Math.round(b.box.y)},w:${Math.round(b.box.width)},h:${Math.round(b.box.height)}])`
        );
      } else {
        // Jarak vertikal antar keduanya (harus positif = tidak menumpuk)
        const gap = b.box.y - (a.box.y + a.box.height);
        r.issues.push(`info: jarak vertikal ${a.label}→${b.label} = ${Math.round(gap)}px (no overlap)`);
      }
    }

    // Cek label vs input overlap (label Start Date menimpa input deadline dsb.)
    if (boxes.length === 2) {
      const labelA = await dialog.getByText("Start Date", { exact: true }).boundingBox();
      const labelB = await dialog.getByText("Deadline", { exact: true }).boundingBox();
      const ovLbl = overlapArea(labelA, labelB);
      if (ovLbl > 1) {
        r.pass = false;
        r.issues.push(`OVERLAP label Start Date ↔ Deadline: ${Math.round(ovLbl)}px²`);
      }
    }

    // Cek horizontal overflow pada document & modal container
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const docOverflow = doc.scrollWidth - doc.clientWidth;
      const modalOverflows = [];
      document.querySelectorAll('[role="dialog"]').forEach((el) => {
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
      path: path.join(SHOT_DIR, `task-dates-${vp.name}.png`),
      fullPage: false,
    });
  } catch (err) {
    r.pass = false;
    r.issues.push(`Exception: ${err.message}`);
  }

  // Console errors (abaikan noise network umum)
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
  console.log("🚀 Verifikasi Start Date & Deadline overlap — modal Buat Task Baru (mobile)\n");
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const r = await verifyViewport(browser, vp);
    results.push(r);
    const status = r.pass ? "✅ PASS" : "❌ FAIL";
    console.log(`${status}  ${r.viewport}`);
    r.issues.forEach((i) => console.log(`   ${r.pass ? "ℹ️ " : "⚠️ "} ${i}`));
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${"=".repeat(50)}`);
  console.log(
    failed.length === 0
      ? "🎉 SEMUA VIEWPORT PASS — Start Date & Deadline tidak overlap di mobile"
      : `❌ ${failed.length}/${results.length} viewport FAIL`
  );

  process.exit(failed.length === 0 ? 0 : 1);
})();