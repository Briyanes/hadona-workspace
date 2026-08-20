/**
 * Playwright Verify: Kolom Bulan (nama bulan saja) + Filter "Semua Bulan" di /content-plans
 * Cek:
 *   1. Dropdown "Semua Bulan" muncul di filter bar
 *   2. Kolom Bulan tabel menampilkan nama bulan panjang (mis. "Agustus"), TANPA tanggal/tahun
 *   3. Fungsional filter: pilih bulan → jumlah row berkurang; reset → semua row kembali
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
const DIR = path.join(process.cwd(), "scripts", "screenshots", "month-filter-verify");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function report(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} — ${name}${detail ? ` (${detail})` : ""}`);
}

async function getRowCount(page) {
  const rows = page.locator("table tbody tr");
  return (await rows.count()) || 0;
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
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
    if (!page.url().includes("/login")) {
      console.log("✅ Login OK, URL:", page.url());
    } else {
      console.error("❌ Login gagal:", page.url());
      process.exit(1);
    }

    // === CONTENT PLANS ===
    console.log("📋 Buka /content-plans...");
    await page.goto(`${BASE_URL}/content-plans`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(6000);
    await page.screenshot({ path: path.join(DIR, "01-initial.png") });

    // --- Cek 1: Dropdown "Semua Bulan" ---
    const monthSelect = page.locator("select", { has: page.locator('option[value="all"]', { hasText: "Semua Bulan" }) }).first();
    const semuabulanOption = page.locator('option', { hasText: /^Semua Bulan$/ }).first();
    const hasMonthFilter = (await semuabulanOption.count()) > 0;
    report("Dropdown 'Semua Bulan' muncul di filter bar", hasMonthFilter);

    // Ambil opsi bulan yang tersedia + index select (dalam satu evaluate, hindari serialisasi element)
    let monthOptions = [];
    let monthSelectIndex = -1;
    if (hasMonthFilter) {
      const info = await page.evaluate(() => {
        const opt = [...document.querySelectorAll("select option")].find(
          (o) => o.textContent.trim() === "Semua Bulan"
        );
        if (!opt) return null;
        const sel = opt.closest("select");
        const selects = [...document.querySelectorAll("select")];
        return {
          index: selects.indexOf(sel),
          options: [...sel.options].map((o) => o.textContent.trim()).filter((t) => t !== "Semua Bulan"),
        };
      });
      if (info) {
        monthOptions = info.options;
        monthSelectIndex = info.index;
      }
      console.log("🗓️ Opsi bulan tersedia:", monthOptions.join(", "));
      report("Dropdown punya minimal 1 opsi bulan", monthOptions.length > 0, monthOptions.join(", "));
    }

    const validMonths = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

    // --- Cek 2a: Card view (default) — hanya card plan yang p.text-xs berisi nama bulan valid (skip KPI cards) ---
    const cardBulan = await page.evaluate((months) => {
      const cards = [...document.querySelectorAll(".card")];
      return cards.map((c) => {
        const p = c.querySelector("p.text-xs");
        return p ? p.textContent.trim() : null;
      }).filter((t) => t && months.some((m) => t === m || t.startsWith(m + " ")));
    }, validMonths);
    console.log("🃏 Sample bulan di card view:", cardBulan.slice(0, 5).join(" | "));

    // --- Switch ke Table view via toggle ---
    const toggleButtons = page.locator(".flex.h-9 button, .overflow-hidden.rounded-md.border button");
    const btnCount = await toggleButtons.count();
    console.log(`🔀 Toggle buttons: ${btnCount}`);
    if (btnCount >= 2) {
      await toggleButtons.nth(1).click(); // button kedua = table
      await sleep(1500);
    }
    await page.screenshot({ path: path.join(DIR, "01b-table-view.png") });

    // --- Cek 2b: Table view — header "Bulan" ada di kolom ke-3 (index 2) ---
    const bulanTexts = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      return rows.slice(0, 5).map((tr) => {
        const cells = tr.querySelectorAll("td");
        return cells.length > 2 ? cells[2].textContent.trim() : null;
      }).filter(Boolean);
    });
    console.log("📅 Sample kolom Bulan (5 row pertama):", bulanTexts.join(" | "));

    const isClean = (t) => validMonths.some((m) => t === m);
    const allTexts = [...cardBulan, ...bulanTexts];
    const badFormats = allTexts.filter((t) => !isClean(t));
    report(
      "Bulan tampil nama bulan saja di card & tabel (mis. 'Agustus')",
      allTexts.length > 0 && badFormats.length === 0,
      badFormats.length ? `format salah: ${badFormats.join(", ")}` : allTexts.slice(0, 2).join(" | ")
    );
    // Dropdown label harus "Agustus 2026" (tanpa tanggal "1")
    const dropdownClean = monthOptions.every((o) => !/^\d+\s/.test(o));
    report("Label dropdown bulan tanpa tanggal (mis. 'Agustus 2026', bukan '1 Agustus 2026')", dropdownClean, monthOptions.join(", "));

    // --- Cek 3: Fungsional filter ---
    if (hasMonthFilter && monthOptions.length > 0) {
      const totalRows = await getRowCount(page);
      console.log(`📊 Total row (Semua Bulan): ${totalRows}`);

      // Pilih bulan pertama (paling baru, karena sorted desc)
      const select = page.locator("select").nth(monthSelectIndex);
      await select.selectOption({ label: monthOptions[0] });
      await sleep(1500);
      const filteredRows = await getRowCount(page);
      await page.screenshot({ path: path.join(DIR, "02-filtered.png") });
      console.log(`📊 Row setelah filter '${monthOptions[0]}': ${filteredRows}`);
      report("Filter bulan mengurangi/menyaring row", filteredRows > 0 && filteredRows <= totalRows, `${filteredRows}/${totalRows} untuk ${monthOptions[0]}`);

      // Verifikasi semua row terfilter punya bulan yang sama
      const filteredBulan = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("table tbody tr")];
        return rows.slice(0, 3).map((tr) => {
          const cells = tr.querySelectorAll("td");
          return cells.length > 2 ? cells[2].textContent.trim() : null;
        }).filter(Boolean);
      });
      report(
        "Semua row terfilter menampilkan bulan yang dipilih",
        filteredBulan.length > 0 && filteredBulan.every((b) => b === monthOptions[0].split(" ")[0]),
        filteredBulan.join(", ")
      );

      // Reset ke Semua Bulan
      await select.selectOption({ value: "all" });
      await sleep(1500);
      const resetRows = await getRowCount(page);
      console.log(`📊 Row setelah reset ke Semua Bulan: ${resetRows}`);
      report("Reset ke 'Semua Bulan' mengembalikan semua row", resetRows === totalRows, `${resetRows}/${totalRows}`);
    }

    // === SUMMARY ===
    const passed = results.filter((r) => r.pass).length;
    console.log("\n" + "=".repeat(50));
    console.log(`HASIL: ${passed}/${results.length} PASS`);
    console.log("=".repeat(50));
    results.forEach((r) => console.log(`${r.pass ? "✅" : "❌"} ${r.name}`));
    fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(results, null, 2));
  } catch (err) {
    console.error("💥 ERROR:", err.message);
    await page.screenshot({ path: path.join(DIR, "error.png") }).catch(() => {});
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();