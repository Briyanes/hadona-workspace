/**
 * Audit layout mobile (390×844) popup "Client Strategy Canvas" (wizard Client Baru) di /strategy
 * Env:
 *   AUDIT_BASE_URL  — default: https://workspace.hadona.id
 *   AUDIT_EMAIL     — required (env)
 *   AUDIT_PASSWORD  — required (env)
 * Note: skrip TIDAK submit form (tidak menulis data ke DB) — hanya navigasi step lalu close modal.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE_URL = process.env.AUDIT_BASE_URL || "https://workspace.hadona.id";
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;
const DIR = "scripts/screenshots/strategy-wizard-mobile";
mkdirSync(DIR, { recursive: true });

const VW = 390;
const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: VW, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

try {
  // ── Login ──
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|tasks|strategy/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // ── Buka /strategy (mobile) ──
  await page.goto(`${BASE_URL}/strategy`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Tombol "Client Baru" — bisa di header PageHeader (wrap di mobile), scroll ke tombol dulu
  const btnClientBaru = page.locator("button:has-text('Client Baru')").first();
  if (!((await btnClientBaru.count()) > 0)) {
    check("Tombol 'Client Baru' tampil", false);
    throw new Error("Tombol Client Baru tidak ditemukan");
  }
  await btnClientBaru.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/00-strategy-mobile.png`, fullPage: false });
  await btnClientBaru.click();
  await page.waitForTimeout(1500);

  // Modal terbuka
  const modalVisible = await page.locator("text=Client Strategy Canvas").first().isVisible();
  check("Modal 'Client Strategy Canvas' terbuka", modalVisible);
  await page.screenshot({ path: `${DIR}/01-step0-profil.png` });

  // ── Helper: cek overflow horizontal di dalam modal ──
  const overflowInfo = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = { scrollW: doc.scrollWidth, clientW: doc.clientWidth, offenders: [] };
    document.querySelectorAll("[role=dialog] *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
        const cs = getComputedStyle(el);
        if (cs.overflowX === "visible" && el.closest(".overflow-x-auto") === null) {
          out.offenders.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
        }
      }
    });
    return out;
  });
  check("Tidak ada horizontal overflow page", overflowInfo.scrollW <= VW + 1, `scrollWidth=${overflowInfo.scrollW} vs ${VW}`);

  // ── Step indicator chips: apakah terpotong (chips ke-6 keluar viewport)? ──
  const stepBar = page.locator("div.overflow-x-auto").first();
  const stepBarBox = await stepBar.boundingBox();
  const lastChip = page.locator("button.rounded-full").last();
  const lastChipBox = await lastChip.boundingBox();
  const chipsClipped = lastChipBox && lastChipBox.x + lastChipBox.width > VW + 2;
  // step indicator discroll horizontal by design — catat sebagai INFO bukan fail
  check("INFO step indicator: chip terakhir terpotong (scrollable by design)", true,
    chipsClipped ? `YA — chip#6 right=${Math.round(lastChipBox.x + lastChipBox.width)}px (butuh fade affordance)` : `tidak — right=${lastChipBox ? Math.round(lastChipBox.x + lastChipBox.width) : "?"}px`);

  // ── Step 0: isi nama agar validasi lolos ──
  await page.fill('input[placeholder="Contoh: RMODA Studio BSD"]', "QA Audit Wizard Mobile");

  // ── Navigasi step 1 (Sosmed) ──
  await page.click("button:has-text('Lanjut')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/02-step1-sosmed.png` });

  // Followers input + checkbox terdesak?
  const followersInput = page.locator('input[placeholder="Followers baseline"]').first();
  const adsCheckbox = page.locator("text=Terhubung ads").first();
  if ((await followersInput.count()) > 0) {
    const fb = await followersInput.boundingBox();
    const cb = await adsCheckbox.boundingBox();
    const cramped = fb && cb && Math.abs(fb.y - cb.y) < 10 && fb.x + fb.width + 8 > cb.x;
    check("Step Sosmed: followers + checkbox tidak bertabrakan", !cramped,
      cramped ? `followers right=${Math.round(fb.x + fb.width)} checkbox x=${Math.round(cb.x)}` : "layout ok");
  }

  // ── Step 2 (Kompetitor) — hanya add satu row untuk cek grid ──
  await page.click("button:has-text('Lanjut')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/03-step2-kompetitor.png` });

  // ── Step 3 (OKR) ──
  await page.click("button:has-text('Lanjut')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/04-step3-okr.png` });

  // Grid 4 input (Metrik/Baseline/Target/Unit) di grid-cols-2 mobile — ukur lebar
  const metricInput = page.locator('input[placeholder="Metrik (ROAS)"]').first();
  const targetInput = page.locator('input[placeholder="Target *"]').first();
  if ((await metricInput.count()) > 0) {
    const mb = await metricInput.boundingBox();
    const tb = await targetInput.boundingBox();
    check("Step OKR: input Metrik cukup lebar (≥110px)", !mb || mb.width >= 110, mb ? `w=${Math.round(mb.width)}px` : "no box");
    check("Step OKR: input Target cukup lebar (≥110px)", !tb || tb.width >= 110, tb ? `w=${Math.round(tb.width)}px` : "no box");
    // placeholder terpotong? cek scrollWidth vs clientWidth dari input itu sendiri
    const metricTrunc = await metricInput.evaluate((el) => el.scrollWidth > el.clientWidth + 2);
    check("Step OKR: placeholder 'Metrik (ROAS)' tidak terpotong", !metricTrunc);
  } else {
    check("Step OKR: input Metrik tampil", false);
  }

  // Isi form OKR agar validasi lolos
  await page.fill('input[placeholder="Contoh: Meningkatkan sales melalui iklan CTWA"]', "QA Objective");
  await page.fill('input[placeholder="Contoh: Mencapai ROAS 5"]', "QA KR");
  await page.fill('input[placeholder="Target *"]', "5");

  // ── Step 4 (4M & Initiatives) ──
  await page.click("button:has-text('Lanjut')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/05-step4-4m.png` });

  // ── Step 5 (Timeline SOP) ──
  await page.click("button:has-text('Lanjut')");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/06-step5-sop.png` });

  // SOP preview rows: judul task panjang vs tanggal — cek wrap/tabrakan
  const sopRow = page.locator("div.card.divide-y > div").first();
  if ((await sopRow.count()) > 0) {
    const rb = await sopRow.boundingBox();
    check("Step SOP: baris preview dalam batas modal", !rb || rb.x + rb.width <= VW + 2, rb ? `right=${Math.round(rb.x + rb.width)}px` : "no box");
  }

  // ── Footer: tombol aksi terlihat semua? ──
  const btnBuat = page.locator("button:has-text('Buat Client + Canvas')");
  const btnBack = page.locator("button:has-text('Kembali')");
  check("Step SOP: tombol 'Buat Client + Canvas' tampil", (await btnBuat.count()) > 0);
  check("Step SOP: tombol '← Kembali' tampil", (await btnBack.count()) > 0);
  if ((await btnBuat.count()) > 0) {
    const bb = await btnBuat.boundingBox();
    check("Footer dalam batas viewport", !bb || bb.x + bb.width <= VW + 2, bb ? `right=${Math.round(bb.x + bb.width)}px` : "no box");
  }

  // ── Tutup modal TANPA submit ──
  await page.locator("[role=dialog] button").first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${DIR}/07-after-close.png` });

  // Verifikasi tidak ada task/client QA yang tersimpan di halaman (modal tertutup saja)
  const modalGone = !((await page.locator("text=Client Strategy Canvas").count()) > 0);
  check("Modal tertutup tanpa submit (aman)", modalGone);
} catch (err) {
  results.push(`❌ ERROR: ${err.message}`);
  await page.screenshot({ path: `${DIR}/99-error.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log("\n═══ HASIL AUDIT MOBILE — Wizard Client Strategy Canvas ═══");
results.forEach((r) => console.log(r));
const fail = results.filter((r) => r.startsWith("❌")).length;
console.log(`\n${fail === 0 ? "SEMUA PASS" : `${fail} CHECK GAGAL`} — screenshot: ${DIR}/`);