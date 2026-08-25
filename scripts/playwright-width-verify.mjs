/**
 * Width Consistency Verification — post double-padding fix
 * Focus: /production, /brand-kits, /approvals, /leads (pages changed)
 * Checks: HTTP, console errors, horizontal overflow (desktop+mobile),
 *         main content padding consistency (should be p-4 md:p-6 from shell, NOT doubled)
 *
 * Usage: node scripts/playwright-width-verify.mjs
 * Prereq: server running on http://localhost:3000
 */

import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://localhost:3000";
const EMAIL = process.env.QA_EMAIL || "admin@hadona.id";
const PASSWORD = process.env.QA_PASSWORD || "@Yogyakarta2026";

const PAGES = [
  { name: "Production", path: "/production" },
  { name: "Brand Kits", path: "/brand-kits" },
  { name: "Approvals", path: "/approvals" },
  { name: "Leads", path: "/leads" },
  // Reference pages (untouched) untuk membandingkan padding
  { name: "Tasks (ref)", path: "/tasks" },
  { name: "Clients (ref)", path: "/clients" },
];

const VIEWPORTS = [
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
];

const results = { pass: 0, fail: 0, warn: 0, issues: [] };
function log(type, test, detail = "") {
  const icon = type === "PASS" ? "✅" : type === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} [${type}] ${test}${detail ? " — " + detail : ""}`);
  if (type === "PASS") results.pass++;
  else if (type === "FAIL") { results.fail++; results.issues.push(`${test}${detail ? ": " + detail : ""}`); }
  else { results.warn++; results.issues.push(`(warn) ${test}${detail ? ": " + detail : ""}`); }
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(2500);
  return !page.url().includes("/login");
}

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
    try {
      const ok = await login(page);
      if (!ok) { log("FAIL", `${p.name} ${vp.label}`, "login gagal"); await ctx.close(); continue; }

      const resp = await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(1500);
      log(resp && resp.status() < 400 ? "PASS" : "FAIL", `${p.name} ${vp.label}: HTTP`, `status=${resp?.status()}`);

      // Horizontal overflow check
      const overflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollW: de.scrollWidth, clientW: de.clientWidth };
      });
      if (overflow.scrollW > overflow.clientW + 1) {
        log("FAIL", `${p.name} ${vp.label}: overflow`, `scrollW=${overflow.scrollW} > viewport=${overflow.clientW}`);
      } else {
        log("PASS", `${p.name} ${vp.label}: no h-overflow`, `${overflow.scrollW}/${overflow.clientW}`);
      }

      // Main padding consistency (desktop: expect 24px from shell p-6; mobile: 16px p-4)
      const pad = await page.evaluate(() => {
        const main = document.querySelector("main");
        if (!main) return null;
        const cs = getComputedStyle(main);
        return { left: cs.paddingLeft, right: cs.paddingRight };
      });
      if (!pad) {
        log("WARN", `${p.name} ${vp.label}: main not found`);
      } else {
        const expL = vp.width >= 768 ? "24px" : "16px";
        const okPad = pad.left === expL && pad.right === expL;
        log(okPad ? "PASS" : "FAIL", `${p.name} ${vp.label}: main padding`, `L=${pad.left} R=${pad.right} (expect ${expL})`);
      }

      // Page header / h1 visible
      const header = await page.locator("h1").first().isVisible().catch(() => false);
      log(header ? "PASS" : "WARN", `${p.name} ${vp.label}: h1 visible`);

      // Console errors (filter benign favicon/extension noise)
      const real = consoleErrors.filter((e) => !/favicon|net::ERR_BLOCKED_BY_CLIENT/i.test(e));
      log(real.length === 0 ? "PASS" : "WARN", `${p.name} ${vp.label}: console`, real.length ? real[0] : "clean");
    } catch (err) {
      log("FAIL", `${p.name} ${vp.label}: crash`, String(err).slice(0, 160));
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();

console.log("\n========== SUMMARY ==========");
console.log(`PASS: ${results.pass} | FAIL: ${results.fail} | WARN: ${results.warn}`);
if (results.issues.length) {
  console.log("\nIssues:");
  results.issues.forEach((i) => console.log(" - " + i));
}
process.exit(results.fail > 0 ? 1 : 0);