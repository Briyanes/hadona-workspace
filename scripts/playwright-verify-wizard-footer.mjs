/**
 * Verifikasi fix bug wizard "Client Strategy Canvas" di /strategy:
 *   BUG  : footer={...} bocor jadi children → tombol Batal/Kembali/Lanjut/Buat Client
 *          dirender di dalam body scroll, sticky footer Modal kosong/absen.
 *   FIX  : footer dipindah ke prop <Modal> → tombol aksi dirender di container
 *          sticky footer (div.border-t.shrink-0) dan selalu terlihat.
 * Juga memverifikasi loadTeamOnce → useEffect (dropdown PIC di step OKR terisi).
 *
 * Env:
 *   AUDIT_BASE_URL  — default: https://workspace.hadona.id
 *   AUDIT_EMAIL     — required
 *   AUDIT_PASSWORD  — required
 * Note: TIDAK submit form (tidak menulis DB) — hanya navigasi step lalu close.
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE_URL = process.env.AUDIT_BASE_URL || "https://workspace.hadona.id";
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;
const DIR = "scripts/screenshots/wizard-footer-verify";
mkdirSync(DIR, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

try {
  if (!EMAIL || !PASSWORD) throw new Error("AUDIT_EMAIL / AUDIT_PASSWORD env wajib diisi");

  // ── Login ──
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|tasks|strategy/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // ── Buka /strategy ──
  await page.goto(`${BASE_URL}/strategy`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const btnClientBaru = page.locator("button:has-text('Client Baru')").first();
  if (!((await btnClientBaru.count()) > 0)) throw new Error("Tombol 'Client Baru' tidak ditemukan — mungkin belum login / deploy lama");
  await btnClientBaru.click();
  await page.waitForTimeout(1500);

  const modalVisible = await page.locator("text=Client Strategy Canvas").first().isVisible();
  check("Modal 'Client Strategy Canvas' terbuka", modalVisible);

  // ══ CHECK INTI #1: tombol aksi harus DI DALAM sticky footer container ══
  // Footer container Modal = div dengan class border-t + shrink-0 (lihat ui/modal.tsx)
  const btnBatal = page.locator("[role=dialog] button:has-text('Batal')");
  const btnLanjut = page.locator("[role=dialog] button:has-text('Lanjut')");
  check("Tombol 'Batal' tampil", (await btnBatal.count()) > 0);
  check("Tombol 'Lanjut' tampil", (await btnLanjut.count()) > 0);

  if ((await btnBatal.count()) > 0) {
    const inStickyFooter = await btnBatal
      .locator('xpath=ancestor::div[contains(@class,"border-t") and contains(@class,"shrink-0")][1]')
      .count();
    check("FIX VERIFIED: tombol aksi dirender di sticky footer Modal (bukan bocor ke body)", inStickyFooter > 0,
      inStickyFooter > 0 ? "footer prop aktif" : "MASIH BUG: footer bocor jadi children");
    await page.screenshot({ path: `${DIR}/01-step0-footer-fixed.png` });
  }

  // ══ CHECK #2: sticky footer terlihat tanpa scroll (dalam viewport) ══
  if ((await btnLanjut.count()) > 0) {
    const bb = await btnLanjut.boundingBox();
    check("Tombol 'Lanjut' dalam viewport (tanpa scroll)", !!bb && bb.y + bb.height <= 800,
      bb ? `y=${Math.round(bb.y)}..${Math.round(bb.y + bb.height)}` : "no box");
  }

  // ══ Navigasi step: isi nama → Lanjut sampai step OKR ══
  await page.fill('input[placeholder="Contoh: RMODA Studio BSD"]', "QA Footer Verify");
  await page.click("[role=dialog] button:has-text('Lanjut')");
  await page.waitForTimeout(600);
  await page.click("[role=dialog] button:has-text('Lanjut')"); // → Kompetitor
  await page.waitForTimeout(600);
  await page.click("[role=dialog] button:has-text('Lanjut')"); // → OKR
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/02-step3-okr.png` });

  // ══ CHECK #3: loadTeamOnce→useEffect — dropdown PIC terisi anggota team ══
  const picOptions = await page.locator("[role=dialog] select option").allTextContents();
  const teamCount = picOptions.filter((t) => t.trim() && t.trim() !== "— PIC —" && !/Q[1-4]|lagging|leading|instagram|tiktok|facebook|youtube|whatsapp|x$|SM$|ADS$/i.test(t.trim())).length;
  check("Dropdown PIC terisi anggota team (useEffect jalan)", teamCount > 0, `${teamCount} opsi PIC`);

  // Isi OKR agar validasi lolos
  await page.fill('input[placeholder="Contoh: Meningkatkan sales melalui iklan CTWA"]', "QA Objective Footer");
  await page.fill('input[placeholder="Contoh: Mencapai ROAS 5"]', "QA KR Footer");
  await page.fill('input[placeholder="Target *"]', "5");

  // Lanjut ke step 4, lalu step 5 (SOP)
  await page.click("[role=dialog] button:has-text('Lanjut')");
  await page.waitForTimeout(600);
  await page.click("[role=dialog] button:has-text('Lanjut')");
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/03-step5-sop.png` });

  // ══ CHECK #4: step terakhir — tombol submit ada di sticky footer ══
  const btnBuat = page.locator("[role=dialog] button:has-text('Buat Client + Canvas')");
  const btnBack = page.locator("[role=dialog] button:has-text('Kembali')");
  check("Step terakhir: tombol 'Buat Client + Canvas' tampil", (await btnBuat.count()) > 0);
  check("Step terakhir: tombol '← Kembali' tampil", (await btnBack.count()) > 0);
  if ((await btnBuat.count()) > 0) {
    const inSticky = await btnBuat
      .locator('xpath=ancestor::div[contains(@class,"border-t") and contains(@class,"shrink-0")][1]')
      .count();
    check("FIX VERIFIED: tombol submit di sticky footer Modal", inSticky > 0);
    const bb = await btnBuat.boundingBox();
    check("Tombol submit dalam viewport", !!bb && bb.y + bb.height <= 800);
    check("Tombol submit enabled (tidak disabled)", await btnBuat.isEnabled());
  }

  // Tutup tanpa submit (aman untuk DB)
  await page.locator("[aria-label='Tutup modal']").click().catch(async () => {
    await page.locator("[role=dialog] button").first().click();
  });
  await page.waitForTimeout(800);
  const modalGone = !((await page.locator("text=Client Strategy Canvas").count()) > 0);
  check("Modal tertutup tanpa submit (aman)", modalGone);
} catch (err) {
  results.push(`❌ ERROR: ${err.message}`);
  await page.screenshot({ path: `${DIR}/99-error.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log("\n═══ VERIFIKASI FIX — Wizard Footer /strategy ═══");
results.forEach((r) => console.log(r));
const fail = results.filter((r) => r.startsWith("❌")).length;
console.log(`\n${fail === 0 ? "SEMUA PASS" : `${fail} CHECK GAGAL`} — screenshot: ${DIR}/`);
process.exit(fail === 0 ? 0 : 1);