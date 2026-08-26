/**
 * Probe DOM modal content plan: dump struktur view-mode untuk lihat
 * apakah UI baru (clamp/expand, accordion slide) ter-render & kenapa [data-slide] tidak ada.
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
await sleep(1500);
await page.locator('input[type="email"]').fill(EMAIL);
await page.locator('input[type="password"]').fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await sleep(4000);
await page.goto(`${BASE_URL}/content-plans`, { waitUntil: "networkidle", timeout: 30000 });
await sleep(4000);

const row = page.locator("tr", { hasText: /Problem Aware|SHUMI/i }).first();
await row.scrollIntoViewIfNeeded();
await row.click();
await sleep(2500);

const info = await page.evaluate(() => {
  const modalEl = [...document.querySelectorAll(".fixed.inset-0")].pop();
  if (!modalEl) return { error: "modal tidak ada" };
  const btnExpand = [...modalEl.querySelectorAll("button")].some((b) =>
    /selengkapnya|sembunyikan/i.test(b.textContent || "")
  );
  const p = [...modalEl.querySelectorAll("p")].find((x) => /Slide 1/i.test(x.textContent || ""));
  return {
    title: modalEl.querySelector("h2")?.textContent,
    btnExpandAda: btnExpand,
    dataSlideCount: modalEl.querySelectorAll("[data-slide]").length,
    pClamped: p ? { maxHeight: p.style.maxHeight, overflow: p.style.overflow, scrollH: p.scrollHeight, offsetH: p.offsetHeight } : null,
    pTextStart: p ? p.textContent.slice(0, 150) : null,
    // cek teks penuh — apakah mengandung pola "Slide N:"? ambil 2 contoh
    slidePatternMatches: p ? (p.textContent.match(/Slide\s*\d+\s*:/g) || []).slice(0, 5) : null,
    labelDetails: [...modalEl.querySelectorAll("h3,h4,span,strong")].map((x) => x.textContent?.trim()).filter((t) => t && /detail/i.test(t)).slice(0, 3),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "scripts/screenshots/content-plans-ux/probe-modal.png" });
await browser.close();