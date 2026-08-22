/**
 * Ukur latency chat end-to-end (sender & receiver) di produksi.
 *
 * Metodologi:
 * - 2 browser context (A = sender, B = receiver), akun sama, channel sama (auto-select pertama)
 * - A menekan Enter → ukur ms sampai bubble terlihat di halaman A (sender latency)
 * -                                   → ukur ms sampai bubble terlihat di halaman B (receiver latency)
 * - 3 sampel, laporan avg/min/max
 *
 * Usage: node scripts/measure-chat-latency.mjs [baseUrl] [label]
 *   label dipakai untuk penanda run, misal "baseline" / "after-fix"
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://workspace.hadona.id";
const LABEL = process.argv[3] || "run";
const EMAIL = process.env.TEST_EMAIL || "admin@hadona.id";
const PASSWORD = process.env.TEST_PASSWORD || "@Yogyakarta2026";
const SAMPLES = 3;
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

async function openChat(page) {
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 30000 });
  await sleep(2500);
  // Tunggu input pesan muncul (channel auto-selected)
  await page.waitForSelector("textarea", { timeout: 15000 });
  // Ambil nama channel dari placeholder untuk verifikasi A==B
  const ph = await page.inputValue("textarea").catch(() => "");
  const placeholder = await page.getAttribute("textarea", "placeholder").catch(() => "");
  return placeholder || "?";
}

(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  console.log(`# Chat Latency Measurement [${LABEL}]`);
  console.log(`# Base: ${BASE}\n`);

  await login(pageA);
  await login(pageB);
  const chA = await openChat(pageA);
  const chB = await openChat(pageB);
  console.log(`Channel A: ${chA}`);
  console.log(`Channel B: ${chB}`);
  if (chA !== chB) {
    console.log("⚠️  Channel A ≠ B — hasil receiver TIDAK valid!");
  }
  await sleep(2000); // beri waktu subscribe realtime

  const results = [];
  for (let i = 1; i <= SAMPLES; i++) {
    const text = `latency-probe-${LABEL}-${Date.now()}-${i}`;
    // Siapkan waiter receiver SEBELUM kirim
    const recvPromise = pageB.waitForSelector(`text="${text}"`, { timeout: 30000 });

    const t0 = Date.now();
    await pageA.fill("textarea", text);
    await pageA.press("textarea", "Enter");

    await pageA.waitForSelector(`text="${text}"`, { timeout: 30000 });
    const tSender = Date.now() - t0;

    await recvPromise;
    const tReceiver = Date.now() - t0;

    results.push({ i, tSender, tReceiver });
    console.log(
      `Sample ${i}: sender=${tSender}ms  receiver=${tReceiver}ms`
    );
    await sleep(1500);
  }

  const avg = (k) => Math.round(results.reduce((s, r) => s + r[k], 0) / results.length);
  const mn = (k) => Math.min(...results.map((r) => r[k]));
  const mx = (k) => Math.max(...results.map((r) => r[k]));

  console.log("\n=== RINGKASAN ===");
  console.log(`Sender  : avg=${avg("tSender")}ms  min=${mn("tSender")}ms  max=${mx("tSender")}ms`);
  console.log(`Receiver: avg=${avg("tReceiver")}ms  min=${mn("tReceiver")}ms  max=${mx("tReceiver")}ms`);
  console.log(`\nJSON: ${JSON.stringify({ label: LABEL, base: BASE, results, senderAvgMs: avg("tSender"), receiverAvgMs: avg("tReceiver") })}`);

  await browser.close();
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});