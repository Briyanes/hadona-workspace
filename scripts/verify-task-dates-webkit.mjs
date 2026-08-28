/**
 * WebKit harness — test overlap Start Date & Deadline di modal
 * "Buat Task Baru" memakai engine WebKit (mimic Safari iOS) + hasTouch,
 * langsung ke production (BASE_URL default https://workspace.hadona.id).
 *
 * Beda dengan verify-task-dates-static.mjs:
 *  - Engine WebKit, bukan Chromium (behavior min-width input date beda)
 *  - iPhone descriptor asli (isMobile, hasTouch, deviceScaleFactor)
 *  - Cek juga bundle CSS/JS yang di-load (build id) untuk deteksi cache
 *
 * Jalankan: node scripts/verify-task-dates-webkit.mjs
 */

import { webkit } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "https://workspace.hadona.id";
const VIEWPORTS = [
  { name: "iphone-13-mini", width: 375, height: 812 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "android-sm", width: 360, height: 800 },
];
const SHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "task-dates-webkit");
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const field = (labelText, inputHtml) => `
  <div>
    <label class="mb-1.5 block text-sm font-medium text-foreground">${labelText}</label>
    ${inputHtml}
  </div>`;

const startField = field("Start Date", `<input type="date" class="input" data-field="start">`);
const deadlineField = field("Deadline", `<input type="date" class="input" data-field="deadline">`);
const selectField = (label, opts) =>
  field(label, `<select class="input">${opts.map((o) => `<option>${o}</option>`).join("")}</select>`);
const textField = (label, ph) =>
  field(label, `<input type="text" class="input" placeholder="${ph}">`);

function modalShell(formAttrs) {
  return `
  <div class="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-0 sm:p-6" id="overlay">
    <div class="mt-auto flex w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:my-auto sm:rounded-xl max-w-2xl" role="dialog" aria-modal="true" id="panel">
      <div class="flex shrink-0 items-center justify-between border-b border-border px-4 py-4 sm:px-6">
        <h2 class="text-base font-semibold text-foreground" id="modal-title">Buat Task Baru</h2>
        <button class="text-muted hover:text-foreground" aria-label="Close">✕</button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" id="modal-body">
        <form ${formAttrs} id="task-form">
          <div class="lg:col-span-2">
            <label class="mb-1.5 block text-sm font-medium text-foreground">Judul Task *</label>
            <input type="text" class="input" placeholder="Contoh: Setup Campaign Meta Ads Client X">
          </div>
          <div class="lg:col-span-2">
            <label class="mb-1.5 block text-sm font-medium text-foreground">Deskripsi</label>
            <textarea rows="2" class="input resize-none" placeholder="Detail tugas (opsional)"></textarea>
          </div>
          <div class="space-y-4">
            ${selectField("Client", ["— Pilih Client —"])}
            ${selectField("Status Awal", ["To Do", "In Progress", "Review", "Blocked", "Done"])}
            ${startField}
            ${textField("Result / Output", "Contoh: Monthly report selesai")}
          </div>
          <div class="space-y-4">
            ${selectField("Prioritas", ["Low", "Medium", "High", "Urgent"])}
            ${selectField("Divisi", ["Digital Marketing", "Creative", "Strategy"])}
            ${field("Assignee", `<div class="input flex items-center justify-between"><span class="text-muted">Pilih anggota…</span><span>▾</span></div>`)}
            ${deadlineField}
            ${textField("Tags (koma)", "opsional")}
          </div>
        </form>
      </div>
      <div class="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button class="px-4 py-2 text-sm text-muted hover:text-foreground">Batal</button>
        <button class="btn-primary">Simpan Task</button>
      </div>
    </div>
  </div>`;
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

async function measure(page) {
  return page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const startInput = q('[data-field="start"]');
    const deadlineInput = q('[data-field="deadline"]');
    const startLabel = [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === "Start Date");
    const deadlineLabel = [...document.querySelectorAll("label")].find((l) => l.textContent.trim() === "Deadline");
    const form = q("#task-form");
    const panel = q("#panel");
    const cssLinks = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href"));
    return {
      start: box(startInput),
      deadline: box(deadlineInput),
      startLabel: box(startLabel),
      deadlineLabel: box(deadlineLabel),
      formDisplay: getComputedStyle(form).display,
      formCols: getComputedStyle(form).gridTemplateColumns,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : -1,
      inputHeight: startInput ? Math.round(startInput.getBoundingClientRect().height) : 0,
      inputMinWidth: startInput ? getComputedStyle(startInput).minWidth : "",
      cssLinks,
    };
  });
}

(async () => {
  console.log("🚀 WebKit harness (Safari iOS mimic) — Start Date vs Deadline\n");
  console.log(`   target: ${BASE_URL}\n`);
  let browser;
  try {
    browser = await webkit.launch({ headless: true });
  } catch (e) {
    console.error("❌ WebKit tidak tersedia:", e.message.split("\n")[0]);
    console.error("   Jalankan: npx playwright install webkit");
    process.exit(1);
  }

  const results = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    const page = await context.newPage();
    const r = { vp: vp.name, pass: true, issues: [], info: [] };
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 45000 });
      await page.evaluate((html) => {
        document.body.insertAdjacentHTML("beforeend", html);
        document.documentElement.classList.add("overflow-hidden");
      }, modalShell(`class="grid grid-cols-1 gap-4 lg:grid-cols-2"`));

      try {
        await page.waitForFunction(
          () => {
            const el = document.querySelector('[data-field="start"]');
            return el && el.getBoundingClientRect().height > 30;
          },
          { timeout: 15000, polling: 250 }
        );
      } catch {
        r.issues.push("⚠️ CSS .input tidak ter-apply dalam 15s");
      }

      await page.evaluate(() => {
        document.querySelector('[data-field="start"]')?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(300);

      const m = await measure(page);
      const ov = overlapArea(m.start, m.deadline);
      const ovLabel = overlapArea(m.startLabel, m.deadlineLabel);
      const ovCross = overlapArea(m.start, m.deadlineLabel);

      r.info.push(`form display=${m.formDisplay} cols=[${m.formCols}] inputH=${m.inputHeight}px minW=${m.inputMinWidth}`);
      r.info.push(
        `start=[${Math.round(m.start?.x || 0)},${Math.round(m.start?.y || 0)} ${Math.round(m.start?.width || 0)}x${Math.round(m.start?.height || 0)}] ` +
          `deadline=[${Math.round(m.deadline?.x || 0)},${Math.round(m.deadline?.y || 0)} ${Math.round(m.deadline?.width || 0)}x${Math.round(m.deadline?.height || 0)}]`
      );
      if (m.cssLinks?.length) r.info.push(`css: ${m.cssLinks.map((l) => l.split("/").pop()).join(", ")}`);

      if (ov > 1) { r.pass = false; r.issues.push(`⛔ OVERLAP input Start↔Deadline: ${Math.round(ov)}px²`); }
      if (ovLabel > 1) { r.pass = false; r.issues.push(`⛔ OVERLAP label: ${Math.round(ovLabel)}px²`); }
      if (ovCross > 1) { r.pass = false; r.issues.push(`⛔ OVERLAP input Start↔label Deadline: ${Math.round(ovCross)}px²`); }
      if (m.docOverflow > 1) { r.pass = false; r.issues.push(`⛔ doc h-overflow ${m.docOverflow}px`); }
      if (m.panelOverflow > 1) { r.pass = false; r.issues.push(`⛔ panel overflow ${m.panelOverflow}px`); }

      await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}.png`) });
    } catch (err) {
      r.pass = false;
      r.issues.push(`Exception: ${err.message.split("\n")[0]}`);
    }
    await context.close();
    results.push(r);
    console.log(`${r.pass ? "✅" : "❌"} [${r.vp}]`);
    r.info.forEach((i) => console.log(`   ℹ️  ${i}`));
    r.issues.forEach((i) => console.log(`   ${i}`));
  }

  await browser.close();
  const fail = results.filter((x) => !x.pass);
  console.log("\n" + "=".repeat(60));
  console.log(fail.length === 0 ? "🎉 WebKit: semua PASS" : `❌ WebKit: ${fail.length}/${results.length} FAIL`);
  console.log(`📸 ${SHOT_DIR}`);
})();