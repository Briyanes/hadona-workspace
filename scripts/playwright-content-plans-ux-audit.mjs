/**
 * Playwright UX Audit: Content Plan Detail Modal
 * Login → /content-plans → buka modal row "Problem Aware" (SHUMI, konten sangat panjang)
 * Ukur: tinggi scroll modal, panjang teks Details, perilaku dropdown Pilar saat Edit (multi-value bug)
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots", "content-plans-ux");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // === LOGIN ===
    console.log("🔐 Login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await sleep(5000);
    console.log("✅ URL:", page.url());

    // === CONTENT PLANS ===
    console.log("📋 Buka /content-plans...");
    await page.goto(`${BASE_URL}/content-plans`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01-list.png"), fullPage: false });

    // Cari row dengan teks "Problem Aware" (SHUMI) — fallback: row SHUMI Japan apapun
    let row = page.locator("tr", { hasText: /Problem Aware/i }).first();
    if (!(await row.count())) {
      console.log("⚠️ 'Problem Aware' tidak ketemu, cari row SHUMI Japan...");
      row = page.locator("tr", { hasText: /SHUMI/i }).first();
    }
    if (!(await row.count())) {
      console.log("❌ Row SHUMI tidak ditemukan. Body text preview:");
      console.log((await page.textContent("body")).slice(0, 500));
      return;
    }
    await row.scrollIntoViewIfNeeded();
    await sleep(500);

    // Ambil teks row sebelum klik
    const rowText = (await row.textContent()).replace(/\s+/g, " ").trim();
    console.log(`🎯 Row ditemukan: "${rowText.slice(0, 120)}..."`);

    // === BUKA MODAL ===
    await row.click();
    await sleep(2000);

    const modal = page.locator(".fixed.inset-0").last();
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-modal-view-top.png") });

    // === UKUR CONTENT SCROLL ===
    const metrics = await page.evaluate(() => {
      // cari elemen scrollable di dalam modal
      const modalEl = [...document.querySelectorAll(".fixed.inset-0")].pop();
      if (!modalEl) return null;
      const scroller = modalEl.querySelector(".overflow-y-auto");
      const detailsEl = [...modalEl.querySelectorAll("p")].find((p) =>
        /Slide 1/i.test(p.textContent || "")
      );
      return {
        scrollHeight: scroller ? scroller.scrollHeight : null,
        clientHeight: scroller ? scroller.clientHeight : null,
        detailsLength: detailsEl ? detailsEl.textContent.length : 0,
        detailsScrollHeight: detailsEl ? detailsEl.scrollHeight : 0,
        hasSlideAccordion: !!modalEl.querySelector("[data-slide]"),
        modalTitle: modalEl.querySelector("h2")?.textContent,
      };
    });
    console.log("\n📊 ═══ METRIK UX MODAL (VIEW MODE) ═══");
    if (metrics) {
      console.log(`   Judul modal          : ${metrics.modalTitle}`);
      console.log(`   Scroll content       : ${metrics.scrollHeight}px vs viewport modal ${metrics.clientHeight}px`);
      console.log(
        `   Panjang teks Details : ${metrics.detailsLength} karakter, tinggi render ${metrics.detailsScrollHeight}px`
      );
      console.log(`   Accordion per-slide  : ${metrics.hasSlideAccordion ? "ADA ✅" : "TIDAK ADA ❌ (teks blob)"}`);
      console.log(
        `   Verdict              : ${
          metrics.scrollHeight > 3 * metrics.clientHeight
            ? "❌ SANGAT PANJANG — butuh clamp/expand + accordion per-slide"
            : metrics.scrollHeight > 1.5 * metrics.clientHeight
            ? "⚠️ Panjang — perlu clamp"
            : "✅ Masih wajar"
        }`
      );
    } else {
      console.log("   ⚠️ Modal tidak terdeteksi");
    }

    // Scroll modal ke bawah untuk screenshot full konten panjang
    await page.evaluate(() => {
      const modalEl = [...document.querySelectorAll(".fixed.inset-0")].pop();
      const scroller = modalEl?.querySelector(".overflow-y-auto");
      if (scroller) scroller.scrollTop = 300;
    });
    await sleep(400);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-modal-view-scrolled.png") });

    // === KLIK EDIT: CEK DROPDOWN PILAR (BUG MULTI-VALUE) ===
    await page.evaluate(() => {
      const modalEl = [...document.querySelectorAll(".fixed.inset-0")].pop();
      const scroller = modalEl?.querySelector(".overflow-y-auto");
      if (scroller) scroller.scrollTop = 0;
    });
    const editBtn = page.locator('button[title="Edit"]');
    if (await editBtn.count()) {
      await editBtn.first().click();
      await sleep(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-modal-edit.png") });

      const pilarValue = await page.evaluate(() => {
        const modalEl = [...document.querySelectorAll(".fixed.inset-0")].pop();
        const sel = modalEl?.querySelector("select");
        return sel ? { value: sel.value, firstOptionText: sel.options[0]?.text } : null;
      });
      console.log("\n📊 ═══ CEK BUG DROPDOWN PILAR (EDIT MODE) ═══");
      if (pilarValue) {
        console.log(`   Nilai dropdown Pilar : "${pilarValue.value}"`);
        console.log(
          `   Row asli pilar       : "Education, Emotional/Pain Point" (multi-value dari sheet)\n` +
            `   Verdict              : ${
              !pilarValue.value || pilarValue.value === ""
                ? "❌ BUG TERKONFIRMASI — dropdown kosong (multi-value tidak match single-select). Save akan MENGHAPUS pilar multi!"
                : "✅ Value terisi"
            }`
        );
      }

      // Cek textarea Details ukurannya
      const taMetrics = await page.evaluate(() => {
        const modalEl = [...document.querySelectorAll(".fixed.inset-0")].pop();
        const textareas = [...(modalEl?.querySelectorAll("textarea") || [])];
        return textareas.map((t) => ({
          rows: t.rows,
          resizable: getComputedStyle(t).resize,
          height: t.offsetHeight,
          valueLen: t.value.length,
        }));
      });
      console.log("\n📊 ═══ CEK TEXTAREA (EDIT MODE) ═══");
      taMetrics.forEach((t, i) =>
        console.log(
          `   Textarea #${i + 1}: rows=${t.rows}, resize=${t.resizable}, tinggi=${t.height}px, isi=${t.valueLen} chars` +
            (t.valueLen > 500 && t.height < 120 ? "  ❌ TERLALU KECIL untuk konten panjang" : "")
        )
      );
    } else {
      console.log("⚠️ Tombol Edit tidak ditemukan");
    }

    console.log(`\n📸 Screenshots tersimpan di: ${SCREENSHOT_DIR}`);
    console.log("\n🏁 Audit UX selesai.");
  } catch (err) {
    console.error("💥 Error:", err.message);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "error.png") }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main();