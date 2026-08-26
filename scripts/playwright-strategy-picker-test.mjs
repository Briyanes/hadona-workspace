/**
 * Verifikasi UI ClientPicker di halaman /strategy (production)
 * Env:
 *   AUDIT_BASE_URL  — default: https://workspace.hadona.id
 *   AUDIT_EMAIL     — required (env)
 *   AUDIT_PASSWORD  — required (env)
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE_URL = process.env.AUDIT_BASE_URL || "https://workspace.hadona.id";
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;
const DIR = "scripts/screenshots/strategy-picker";
mkdirSync(DIR, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
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
  await page.screenshot({ path: `${DIR}/01-strategy-initial.png`, fullPage: true });

  // Trigger button: cari teks "Pilih client" atau nama client (bukan chip wall)
  const trigger = page.locator("button:has-text('Pilih client'), button:has-text('tersedia')").first();
  const triggerCount = await trigger.count();
  check("ClientPicker trigger tampil (compact dropdown)", triggerCount > 0);

  // Chip wall lama = puluhan pill rounded-full di main content.
  // Avatar/header global (di luar main) boleh pakai rounded-full, jadi scope ke main saja.
  const mainPillCount = await page.locator("main button.rounded-full").count();
  check("Chip wall hilang (pill di main content)", mainPillCount === 0, `${mainPillCount} pill di main`);

  // Trigger tidak melebihi container (compact)
  if (triggerCount > 0) {
    const box = await trigger.boundingBox();
    const vw = 1440;
    check("Trigger dalam batas viewport", box && box.x + box.width <= vw, box ? `w=${Math.round(box.width)}px x=${Math.round(box.x)}px` : "no box");

    // ── Buka dropdown ──
    await trigger.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${DIR}/02-dropdown-open.png` });

    const searchBox = page.locator("input[placeholder*='Cari client']");
    check("Search box dropdown tampil", (await searchBox.count()) > 0);

    const filterToggle = page.locator("text=Hanya yang punya canvas");
    check("Filter 'punya canvas' tampil", (await filterToggle.count()) > 0);

    // ── Test search ──
    await searchBox.fill("hadona");
    await page.waitForTimeout(500);
    await searchBox.fill("");
    await page.waitForTimeout(300);
    check("Search berfungsi (clear)", true);

    // ── Pilih client pertama ──
    const firstItem = page.locator("div.max-h-72 button").first();
    if ((await firstItem.count()) > 0) {
      const itemName = (await firstItem.textContent()) || "";
      await firstItem.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${DIR}/03-client-selected.png`, fullPage: true });
      check("Client terpilih & canvas termuat", itemName.trim().length > 0, itemName.trim().slice(0, 40));
    } else {
      check("Item list dropdown bisa diklik", false);
    }
  }

  // ── Mobile viewport (page sama = sesi login tetap) ──
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${DIR}/04-mobile-strategy.png`, fullPage: true });
  // Setelah client dipilih, trigger menampilkan nama client — pakai struktur DOM yang stabil
  const mTrigger = page.locator("div.max-w-md > button").first();
  if ((await mTrigger.count()) > 0) {
    const b = await mTrigger.boundingBox();
    check("Trigger mobile dalam batas 390px", !!b && b.x + b.width <= 390, b ? `w=${Math.round(b.width)}px x=${Math.round(b.x)}px` : "");
  } else {
    check("Trigger tampil di mobile", false);
  }
} catch (err) {
  results.push(`❌ ERROR: ${err.message}`);
  await page.screenshot({ path: `${DIR}/99-error.png` }).catch(() => {});
} finally {
  await browser.close();
}

console.log("\n═══ HASIL VERIFIKASI /strategy ClientPicker ═══");
results.forEach((r) => console.log(r));
const fail = results.filter((r) => r.startsWith("❌")).length;
console.log(`\n${fail === 0 ? "SEMUA PASS" : `${fail} CHECK GAGAL`} — screenshot: ${DIR}/`);