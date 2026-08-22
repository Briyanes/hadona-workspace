/**
 * Diagnosa: kenapa receiver lambat ~3 detik?
 * Log timestamp relatif (ms dari Enter) untuk:
 * - T0: Enter di pageA
 * - POST /api/chat/messages selesai (response pageA)
 * - Frame websocket pageB yang berisi probe text (realtime INSERT event sampai socket)
 * - Fetch enrich di pageB (request start + response end)
 * - Bubble terlihat di pageA & pageB
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL || "admin@hadona.id";
const PASSWORD = process.env.TEST_PASSWORD || "@Yogyakarta2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(1500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await sleep(4000);
  if (page.url().includes("/login")) throw new Error("LOGIN GAGAL");
}

(async () => {
  const browser = await chromium.launch();
  const pageA = await (await browser.newContext()).newPage();
  const pageB = await (await browser.newContext()).newPage();

  await login(pageA);
  await login(pageB);
  for (const p of [pageA, pageB]) {
    await p.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await p.waitForSelector("textarea", { timeout: 15000 });
  }
  await sleep(3000);

  // Track pageB websocket frames + fetches
  const sockets = new Set();
  pageB.on("websocket", (ws) => {
    sockets.add(ws);
    ws.on("framereceived", (frame) => {
      if (globalThis.__probe && frame.payload && String(frame.payload).includes(globalThis.__probe)) {
        console.log(`  [B ws-frame]  +${Date.now() - globalThis.__t0}ms  (payload contains probe)`);
      }
    });
  });
  pageB.on("request", (req) => {
    if (globalThis.__probe && req.url().includes("messageId=")) {
      console.log(`  [B fetch-req] +${Date.now() - globalThis.__t0}ms  ${req.url().split("?")[1]}`);
    }
  });
  pageB.on("response", (res) => {
    if (globalThis.__probe && res.url().includes("messageId=")) {
      console.log(`  [B fetch-res] +${Date.now() - globalThis.__t0}ms  status=${res.status()}`);
    }
  });
  pageA.on("response", (res) => {
    if (globalThis.__probe && res.url().endsWith("/api/chat/messages") && res.request().method() === "POST") {
      console.log(`  [A POST done] +${Date.now() - globalThis.__t0}ms  status=${res.status()}`);
    }
  });

  for (let i = 1; i <= 3; i++) {
    const text = `diag-probe-${Date.now()}-${i}`;
    globalThis.__probe = text;
    console.log(`\n--- Sample ${i}: ${text} ---`);
    const recvPromise = pageB.waitForSelector(`text="${text}"`, { timeout: 30000 });

    globalThis.__t0 = Date.now();
    await pageA.fill("textarea", text);
    await pageA.press("textarea", "Enter");

    await pageA.waitForSelector(`text="${text}"`, { timeout: 30000 });
    console.log(`  [A visible]   +${Date.now() - globalThis.__t0}ms`);
    await recvPromise;
    console.log(`  [B visible]   +${Date.now() - globalThis.__t0}ms`);
    globalThis.__probe = null;
    await sleep(1500);
  }

  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });