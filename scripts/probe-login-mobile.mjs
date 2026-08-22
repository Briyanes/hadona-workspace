/**
 * Probe: debug kenapa login gagal di mobile context — screenshot + dump pesan error
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL || "admin@hadona.id";
const PASSWORD = process.env.TEST_PASSWORD || "@Yogyakarta2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
await sleep(1500);
await page.screenshot({ path: "scripts/screenshots/probe-login-before.png" });

// dump form yang terlihat
const inputs = await page.locator("input").all();
console.log(`Jumlah input: ${inputs.length}`);
for (const i of inputs) {
  console.log(`  input type=${await i.getAttribute("type")} placeholder=${await i.getAttribute("placeholder")}`);
}

const emailInput = page.locator('input[type="email"]');
const passInput = page.locator('input[type="password"]');
console.log("email visible:", await emailInput.isVisible().catch(() => false));
console.log("pass visible:", await passInput.isVisible().catch(() => false));

await emailInput.fill(EMAIL);
await passInput.fill(PASSWORD);
await page.locator('button[type="submit"]').first().click();
await sleep(5000);

await page.screenshot({ path: "scripts/screenshots/probe-login-after.png" });
console.log("URL setelah submit:", page.url());

// dump pesan error/toast
const text = await page.locator("body").innerText();
const lines = text.split("\n").filter((l) => l.trim()).slice(0, 25);
console.log("\n--- BODY TEXT ---");
lines.forEach((l) => console.log(" |", l));

await browser.close();