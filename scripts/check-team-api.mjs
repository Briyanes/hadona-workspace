if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
  console.error("Set TEST_EMAIL and TEST_PASSWORD env vars first!");
  process.exit(1);
}

import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

// Capture semua request /api/team + responsenya
const teamResponses = [];
page.on("response", async (res) => {
  if (res.url().includes("/api/team")) {
    let body = "";
    try { body = (await res.text()).slice(0, 300); } catch {}
    teamResponses.push({ status: res.status(), method: res.request().method(), body });
  }
});

await page.goto("https://workspace.hadona.id/login", { waitUntil: "networkidle", timeout: 30000 });
await sleep(1500);
await page.locator('input[type="email"]').fill(process.env.TEST_EMAIL);
await page.locator('input[type="password"]').fill(process.env.TEST_PASSWORD);
await page.locator('button[type="submit"]').first().click();
await sleep(4000);
await page.goto("https://workspace.hadona.id/chat", { waitUntil: "networkidle", timeout: 30000 });
await sleep(8000);
await browser.close();

console.log("=== /api/team responses (via app) ===");
if (teamResponses.length === 0) console.log("(tidak ada request /api/team tertangkap)");
for (const r of teamResponses) {
  console.log(`${r.method} → ${r.status}`);
  console.log(`body: ${r.body}`);
}
