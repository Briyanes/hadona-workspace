/**
 * Static harness — verifikasi overlap Start Date & Deadline di modal
 * "Buat Task Baru" pada viewport mobile, TANPA login.
 *
 * Metode: load halaman publik /login dari dev server (memuat globals.css
 * asli: Tailwind + class .input), lalu injeksi replika DOM modal
 * (markup persis dari src/components/ui/modal.tsx dan
 * src/components/tasks/task-board/create-task-modal.tsx), tunggu CSS
 * benar-benar applied (poll computed style), lalu ukur boundingBox
 * field Start Date vs Deadline.
 *
 * Varian:
 *   A) CURRENT — grid grid-cols-1 gap-4 lg:grid-cols-2  (kode sekarang)
 *   B) LEGACY  — display:grid 2 kolom via inline style (mensimulasikan
 *               bundle lama yang memaksa 2 kolom di mobile)
 *
 * Jalankan: node scripts/verify-task-dates-static.mjs
 * BASE_URL default http://localhost:3000
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIEWPORTS = [
  { name: "mobile-375", width: 375, height: 812 }, // iPhone X/11/12 mini
  { name: "mobile-390", width: 390, height: 844 }, // iPhone 14
  { name: "mobile-360", width: 360, height: 800 }, // Android kecil
];
const SHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "task-dates-static");
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

/** Markup field persis create-task-modal.tsx */
const field = (labelText, inputHtml) => `
  <div>
    <label class="mb-1.5 block text-sm font-medium text-foreground">${labelText}</label>
    ${inputHtml}
  </div>`;

const startField = field(
  "Start Date",
  `<input type="date" class="input" data-field="start">`
);
const deadlineField = field(
  "Deadline",
  `<input type="date" class="input" data-field="deadline">`
);
const selectField = (label, opts) =>
  field(
    label,
    `<select class="input">${opts.map((o) => `<option>${o}</option>`).join("")}</select>`
  );
const textField = (label, ph) =>
  field(label, `<input type="text" class="input" placeholder="${ph}">`);

/** Reproduksi struktur modal.tsx (size=lg → max-w-2xl, scrollable) */
function modalShell(formAttrs) {
  // Susunan kolom persis komponen: LEFT (Client, Status, Start Date, Result)
  // RIGHT (Prioritas, Divisi, Assignee, Deadline, Tags)
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
    const startLabel = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.trim() === "Start Date"
    );
    const deadlineLabel = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.trim() === "Deadline"
    );
    const form = q("#task-form");
    const panel = q("#panel");
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
    };
  });
}

(async () => {
  console.log("🚀 Static harness — Start Date vs Deadline (modal Buat Task Baru)\n");
  const browser = await chromium.launch({ headless: true });
  const variants = [
    { name: "CURRENT", tag: "current", attrs: `class="grid grid-cols-1 gap-4 lg:grid-cols-2"` },
    { name: "LEGACY-2col", tag: "legacy", attrs: `class="grid grid-cols-1 gap-4 lg:grid-cols-2" style="display:grid;grid-template-columns:1fr 1fr;column-gap:1rem"` },
  ];
  const results = [];

  for (const vp of VIEWPORTS) {
    for (const variant of variants) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const r = { vp: vp.name, variant: variant.name, pass: true, issues: [], info: [] };
      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
        // Bersihkan body lalu injeksi modal
        await page.evaluate((html) => {
          document.body.insertAdjacentHTML("beforeend", html);
          document.documentElement.classList.add("overflow-hidden");
        }, modalShell(variant.attrs));

        // TUNGGU CSS applied: input .input harus punya height > 30px
        try {
          await page.waitForFunction(
            () => {
              const el = document.querySelector('[data-field="start"]');
              return el && el.getBoundingClientRect().height > 30;
            },
            { timeout: 15000, polling: 250 }
          );
        } catch {
          r.issues.push("⚠️ CSS .input tidak ter-apply dalam 15s (hasil bisa tidak valid)");
        }

        // Scroll modal-body agar Start Date terlihat
        await page.evaluate(() => {
          document.querySelector('[data-field="start"]')?.scrollIntoView({ block: "center" });
        });
        await page.waitForTimeout(200);

        const m = await measure(page);
        const ov = overlapArea(m.start, m.deadline);
        const ovLabel = overlapArea(m.startLabel, m.deadlineLabel);
        const ovCross1 = overlapArea(m.start, m.deadlineLabel);

        r.info.push(`form display=${m.formDisplay} cols=[${m.formCols}] inputH=${m.inputHeight}px`);
        r.info.push(
          `start=[${Math.round(m.start?.x || 0)},${Math.round(m.start?.y || 0)} ${Math.round(m.start?.width || 0)}x${Math.round(m.start?.height || 0)}] ` +
            `deadline=[${Math.round(m.deadline?.x || 0)},${Math.round(m.deadline?.y || 0)} ${Math.round(m.deadline?.width || 0)}x${Math.round(m.deadline?.height || 0)}]`
        );

        if (ov > 1) {
          r.pass = false;
          r.issues.push(`⛔ OVERLAP input Start Date ↔ Deadline: ${Math.round(ov)}px²`);
        }
        if (ovLabel > 1) {
          r.pass = false;
          r.issues.push(`⛔ OVERLAP label Start Date ↔ Deadline: ${Math.round(ovLabel)}px²`);
        }
        if (ovCross1 > 1) {
          r.pass = false;
          r.issues.push(`⛔ OVERLAP input Start Date ↔ label Deadline: ${Math.round(ovCross1)}px²`);
        }
        if (m.docOverflow > 1) {
          r.pass = false;
          r.issues.push(`⛔ document horizontal overflow ${m.docOverflow}px`);
        }
        if (m.panelOverflow > 1) {
          r.pass = false;
          r.issues.push(`⛔ modal panel overflow ${m.panelOverflow}px`);
        }
        if ((m.start?.width || 0) < 150) {
          r.issues.push(`⚠️ lebar input date hanya ${Math.round(m.start?.width || 0)}px (<150px)`);
        }

        await page.screenshot({
          path: path.join(SHOT_DIR, `${vp.name}-${variant.tag}.png`),
        });
      } catch (err) {
        r.pass = false;
        r.issues.push(`Exception: ${err.message.split("\n")[0]}`);
      }
      await context.close();
      results.push(r);
      const status = r.pass ? "✅" : "❌";
      console.log(`${status} [${r.vp}] ${r.variant}`);
      r.info.forEach((i) => console.log(`     ℹ️  ${i}`));
      r.issues.forEach((i) => console.log(`     ${i}`));
    }
  }

  await browser.close();
  const fail = results.filter((r) => !r.pass);
  console.log("\n" + "=".repeat(60));
  console.log(
    fail.length === 0
      ? "🎉 Semua kombinasi PASS — tidak ada overlap"
      : `❌ ${fail.length}/${results.length} FAIL (lihat atas)`
  );
  console.log(`📸 Screenshots: ${SHOT_DIR}`);
  process.exit(0); // selalu 0: harness diagnostik
})();