#!/usr/bin/env node
/**
 * Smoke Test Runner — Hadona Workspace
 *
 * Core regression suite: 6 critical flows, headless, exit-code untuk CI.
 *
 * Coverage:
 *   1. Login page renders + form accessible
 *   2. Auth: login succeeds → redirect to dashboard
 *   3. Dashboard loads without fatal console/network errors
 *   4. Tasks page loads
 *   5. Clients page loads
 *   6. Reports page loads
 *   + Mobile viewport spot-check (390x844) on dashboard
 *
 * Usage:
 *   TEST_EMAIL=xxx TEST_PASSWORD=xxx npm run test:smoke
 *   BASE_URL=https://workspace.hadona.id TEST_EMAIL=... TEST_PASSWORD=... npm run test:smoke
 *
 * Env:
 *   BASE_URL      — target app (default: http://localhost:3000)
 *   TEST_EMAIL    — required, test account email
 *   TEST_PASSWORD — required, test account password
 *   HEADED=1      — run with visible browser (debug)
 *
 * Exit code: 0 = all pass, 1 = any fail.
 */

import { chromium } from 'playwright';
import fs from 'fs';

// ─── Config ───
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const HEADED = process.env.HEADED === '1';
const SHOT_DIR = 'scripts/screenshots/smoke';

if (!EMAIL || !PASSWORD) {
  console.error('❌ TEST_EMAIL and TEST_PASSWORD env vars are required.');
  console.error('   Usage: TEST_EMAIL=xxx TEST_PASSWORD=xxx npm run test:smoke');
  process.exit(1);
}

// Console noise yang boleh diabaikan (third-party / non-fatal)
const CONSOLE_IGNORE = [
  /favicon/i,
  /jitsi/i,                    // third-party meet iframe noise
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
  /net::ERR_ABORTED.*(jitsi|meet)/i,
];

// Network host yang boleh gagal (third-party, bukan app supabase/api kita)
const NETWORK_IGNORE_HOSTS = ['jitsi', 'meet.jit.si', 'google-analytics'];

const results = [];
let browser;
let context;
let page;
let consoleErrors = [];
let networkErrors = [];

function record(name, status, detail = '') {
  results.push({ name, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function freshPage(viewport = { width: 1440, height: 900 }) {
  if (page) await page.close().catch(() => {});
  context = await browser.newContext({ viewport });
  page = await context.newPage();
  attachListeners(page);
  return page;
}

function attachListeners(p) {
  consoleErrors = [];
  networkErrors = [];
  p.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_IGNORE.some(rx => rx.test(text))) return;
    consoleErrors.push(text);
  });
  p.on('pageerror', err => consoleErrors.push(err.message));
  p.on('requestfailed', req => {
    const url = req.url();
    if (NETWORK_IGNORE_HOSTS.some(h => url.includes(h))) return;
    // ERR_ABORTED pada _rsc/prefetch = navigasi Next.js membatalkan prefetch (normal, bukan error)
    const failureText = req.failure()?.errorText || '';
    if (failureText === 'net::ERR_ABORTED') return;
    if (url.includes(BASE_URL.replace(/^https?:\/\//, '')) || url.includes('supabase') || url.includes('/api/')) {
      networkErrors.push(`${failureText} — ${url.slice(0, 120)}`);
    }
  });
}

function errorReport() {
  let report = '';
  if (consoleErrors.length) {
    report += `${consoleErrors.length} console error(s)`;
    if (networkErrors.length) report += ', ';
  }
  if (networkErrors.length) report += `${networkErrors.length} network error(s)`;
  if (consoleErrors.length) {
    consoleErrors.slice(0, 3).forEach(e => console.log(`       · console: ${e.slice(0, 160)}`));
  }
  if (networkErrors.length) {
    networkErrors.slice(0, 3).forEach(e => console.log(`       · network: ${e}`));
  }
  return report;
}

async function shot(name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false }).catch(() => {});
}

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log(`  SMOKE TEST — ${BASE_URL}`);
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════\n');

  browser = await chromium.launch({ headless: !HEADED });

  // ── 1. Login page renders ──
  console.log('── 1. Login page ──');
  try {
    page = await freshPage();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    const emailInput = await page.locator('input[type="email"]').count();
    const passwordInput = await page.locator('input[type="password"]').count();
    const submitBtn = await page.locator('button[type="submit"]').count();
    if (emailInput > 0 && passwordInput > 0 && submitBtn > 0) {
      const errs = errorReport();
      record('Login page renders', errs ? 'WARNING' : 'PASS', errs || 'form complete');
    } else {
      await shot('01-login-missing-form');
      record('Login page renders', 'FAIL', `email=${emailInput} password=${passwordInput} submit=${submitBtn}`);
    }
  } catch (e) {
    await shot('01-login-error');
    record('Login page renders', 'FAIL', e.message.slice(0, 120));
  }

  // ── 2. Login flow ──
  console.log('── 2. Login flow ──');
  try {
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 });
    await page.waitForTimeout(2500);
    const onDashboard = !page.url().includes('/login');
    if (onDashboard) {
      record('Login succeeds → dashboard', 'PASS', page.url());
    } else {
      await shot('02-login-stuck');
      record('Login succeeds → dashboard', 'FAIL', 'still on /login');
    }
  } catch (e) {
    await shot('02-login-error');
    record('Login succeeds → dashboard', 'FAIL', e.message.slice(0, 120));
  }

  // ── 3. Dashboard ──
  console.log('── 3. Dashboard (desktop 1440x900) ──');
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const hasErrorBoundary = await page.locator('text=/something went wrong|terjadi kesalahan/i').count();
    const errs = errorReport();
    if (hasErrorBoundary > 0) {
      await shot('03-dashboard-error-boundary');
      record('Dashboard loads', 'FAIL', 'error boundary visible');
    } else {
      record('Dashboard loads', errs ? 'WARNING' : 'PASS', errs || 'clean console & network');
    }
    await shot('03-dashboard');
  } catch (e) {
    await shot('03-dashboard-error');
    record('Dashboard loads', 'FAIL', e.message.slice(0, 120));
  }

  // ── 4-6. Core pages ──
  const corePages = [
    { name: 'Tasks page loads', url: '/tasks', shot: '04-tasks' },
    { name: 'Clients page loads', url: '/clients', shot: '05-clients' },
    { name: 'Reports page loads', url: '/reports', shot: '06-reports' },
  ];
  for (const t of corePages) {
    console.log(`── ${t.name} ──`);
    try {
      await page.goto(`${BASE_URL}${t.url}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2500);
      const stillOnPage = page.url().includes(t.url) || !page.url().includes('/login');
      const hasErrorBoundary = await page.locator('text=/something went wrong|terjadi kesalahan/i').count();
      const errs = errorReport();
      if (!stillOnPage) {
        await shot(`${t.shot}-redirect`);
        record(t.name, 'FAIL', `redirected to ${page.url()}`);
      } else if (hasErrorBoundary > 0) {
        await shot(`${t.shot}-error`);
        record(t.name, 'FAIL', 'error boundary visible');
      } else {
        await shot(t.shot);
        record(t.name, errs ? 'WARNING' : 'PASS', errs || 'OK');
      }
    } catch (e) {
      await shot(`${t.shot}-error`);
      record(t.name, 'FAIL', e.message.slice(0, 120));
    }
  }

  // ── 7. Mobile spot-check ──
  console.log('── 7. Dashboard mobile (390x844) ──');
  try {
    await freshPage({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 20000 });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await shot('07-dashboard-mobile');
    if (overflow > 2) {
      record('Dashboard mobile no horizontal overflow', 'WARNING', `${overflow}px horizontal overflow`);
    } else {
      record('Dashboard mobile no horizontal overflow', 'PASS', 'no overflow');
    }
  } catch (e) {
    await shot('07-dashboard-mobile-error');
    record('Dashboard mobile no horizontal overflow', 'FAIL', e.message.slice(0, 120));
  }

  // ── Summary ──
  const pass = results.filter(r => r.status === 'PASS').length;
  const warn = results.filter(r => r.status === 'WARNING').length;
  const fail = results.filter(r => r.status === 'FAIL').length;

  console.log('\n═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`  ${icon} [${r.status}] ${r.name}`);
  });
  console.log('───────────────────────────────────────────────');
  console.log(`  ${pass} pass · ${warn} warning · ${fail} fail`);
  console.log(`  Screenshots: ${SHOT_DIR}/`);
  console.log('═══════════════════════════════════════════════\n');

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(async e => {
  console.error('💥 Runner crashed:', e);
  await browser?.close().catch(() => {});
  process.exit(1);
});