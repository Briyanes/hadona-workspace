/**
 * Playwright Deep QA (v2)
 * - Login SEKALI di bootstrap context, simpan storageState, reuse untuk semua viewport
 *   (menghindari rate-limit Supabase auth).
 * - Sweep semua halaman dashboard di 4 viewport (1440x900, 1280x800, 390x844, 375x812).
 * - Checks: page load, console errors, page errors, failed requests, broken images,
 *   horizontal overflow, blank screen.
 *
 * Usage: node scripts/playwright-deep-qa.mjs
 * Env: QA_EMAIL, QA_PASSWORD
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'admin@hadona.id';
const PASSWORD = process.env.QA_PASSWORD || '@Yogyakarta2026';
const STATE_FILE = '/tmp/hadona-qa-state.json';

const PAGES = [
  { name: 'Dashboard', path: '/' },
  { name: 'Tasks', path: '/tasks' },
  { name: 'Clients', path: '/clients' },
  { name: 'Chat', path: '/chat' },
  { name: 'Reports', path: '/reports' },
  { name: 'Content Plans', path: '/content-plans' },
  { name: 'Content Studio', path: '/content-studio' },
  { name: 'Strategy', path: '/strategy' },
  { name: 'Creative', path: '/creative' },
  { name: 'Production', path: '/production' },
  { name: 'Invoices', path: '/invoices' },
  { name: 'Calendar', path: '/calendar' },
  { name: 'Monthly Reports', path: '/monthly-reports' },
  { name: 'Leads', path: '/leads' },
  { name: 'Approvals', path: '/approvals' },
  { name: 'Timesheet', path: '/timesheet' },
  { name: 'Users', path: '/users' },
  { name: 'Brand Kits', path: '/brand-kits' },
  { name: 'Ads Spend', path: '/ads-spend' },
  { name: 'Settings', path: '/settings' },
  { name: 'Settings Profile', path: '/settings/profile' },
  { name: 'Settings Integrations', path: '/settings/integrations' },
  { name: 'Settings Notifications', path: '/settings/notifications' },
  { name: 'Settings Security', path: '/settings/security' },
];

const VIEWPORTS = [
  { label: 'desktop-1440x900', width: 1440, height: 900 },
  { label: 'desktop-1280x800', width: 1280, height: 800 },
  { label: 'mobile-390x844', width: 390, height: 844 },
  { label: 'mobile-375x812', width: 375, height: 812 },
];

const CONSOLE_NOISE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /third-party cookie/i,
  /worker.*websocket.*supabase/i,
];

// Avatar Google OAuth (URL lh3 kadaluarsa) = data eksternal, bukan bug app.
// Tetap dicatat sebagai catatan, tidak dihitung sebagai broken image app.
const EXTERNAL_AVATAR_RE = /^https:\/\/lh\d\.googleusercontent\.com\//;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classify(entry) {
  if (entry.fatal) return 'FAIL';
  const w =
    entry.consoleErrors.length +
    entry.pageErrors.length +
    entry.failedRequests.length +
    entry.brokenImages.length;
  if (w === 0 && !entry.horizontalOverflow && !entry.blankScreen) return 'PASS';
  return 'WARNING';
}

async function bootstrapLogin(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  await sleep(2500);
  await context.storageState({ path: STATE_FILE });
  await context.close();
  console.log('Bootstrap login OK — storageState tersimpan.');
}

async function auditPage(page, vp, pageInfo) {
  const entry = {
    page: pageInfo.name,
    path: pageInfo.path,
    viewport: vp.label,
    status: 'PASS',
    loadMs: null,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    brokenImages: [],
    externalAvatarIssues: [],
    horizontalOverflow: false,
    blankScreen: false,
    notes: [],
  };

  const onConsole = (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_NOISE.some((re) => re.test(text))) return;
    entry.consoleErrors.push(text.slice(0, 300));
  };
  const onPageError = (err) => entry.pageErrors.push(String(err.message || err).slice(0, 300));
  const onResponse = (res) => {
    if (res.status() >= 400) {
      entry.failedRequests.push(`${res.status()} ${res.request().method()} ${res.url().replace(BASE, '')}`.slice(0, 250));
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  const t0 = Date.now();
  try {
    await page.goto(`${BASE}${pageInfo.path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    entry.fatal = `goto failed: ${String(e.message).slice(0, 200)}`;
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    entry.status = classify(entry);
    return entry;
  }
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await sleep(1200);
  entry.loadMs = Date.now() - t0;

  try {
    const bodyText = (await page.evaluate(() => document.body?.innerText || '')).trim();
    if (bodyText.length < 10) entry.blankScreen = true;
    entry.horizontalOverflow = await page.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth - de.clientWidth > 4;
    });
    const badImgs = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:'))
        .map((img) => img.src.replace(window.location.origin, ''))
        .slice(0, 8)
    );
    for (const src of badImgs) {
      if (EXTERNAL_AVATAR_RE.test(src)) entry.externalAvatarIssues.push(src);
      else entry.brokenImages.push(src);
    }
  } catch (e) {
    entry.notes.push(`evaluate failed: ${String(e.message).slice(0, 120)}`);
  }

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  entry.status = classify(entry);
  return entry;
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  await bootstrapLogin(browser);

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      storageState: STATE_FILE,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    console.log(`\n=== ${vp.label} (session reused) ===`);
    for (const pageInfo of PAGES) {
      const entry = await auditPage(page, vp, pageInfo);
      results.push(entry);
      const flag = entry.status === 'PASS' ? '✅' : entry.status === 'WARNING' ? '⚠️ ' : '❌';
      console.log(
        `${flag} ${pageInfo.name.padEnd(24)} ${entry.status}${entry.loadMs ? ` (${entry.loadMs}ms)` : ''}` +
          (entry.consoleErrors.length ? ` console:${entry.consoleErrors.length}` : '') +
          (entry.failedRequests.length ? ` net:${entry.failedRequests.length}` : '') +
          (entry.pageErrors.length ? ` js:${entry.pageErrors.length}` : '') +
          (entry.brokenImages.length ? ` img:${entry.brokenImages.length}` : '') +
          (entry.externalAvatarIssues.length ? ` extAvatar:${entry.externalAvatarIssues.length}` : '') +
          (entry.horizontalOverflow ? ' H-OVERFLOW' : '') +
          (entry.blankScreen ? ' BLANK' : '')
      );
    }
    await context.close();
  }

  await browser.close();
  fs.writeFileSync('scripts/deep-qa-report.json', JSON.stringify(results, null, 2));

  console.log('\n================ SUMMARY ================');
  let pass = 0, warn = 0, fail = 0;
  for (const r of results) {
    if (r.status === 'PASS') pass++;
    else if (r.status === 'WARNING') warn++;
    else fail++;
  }
  console.log(`Total checks: ${results.length} | PASS: ${pass} WARNING: ${warn} FAIL: ${fail}`);

  const nonPass = results.filter((x) => x.status !== 'PASS');
  if (nonPass.length) {
    console.log('\nNon-PASS details:');
    for (const r of nonPass) {
      console.log(`\n[${r.viewport}] ${r.page} (${r.path}) → ${r.status}`);
      r.fatal && console.log('  FATAL:', r.fatal);
      (r.consoleErrors || []).slice(0, 3).forEach((e) => console.log('  console:', e));
      (r.pageErrors || []).slice(0, 3).forEach((e) => console.log('  jsError:', e));
      (r.failedRequests || []).slice(0, 5).forEach((e) => console.log('  network:', e));
      (r.brokenImages || []).slice(0, 3).forEach((e) => console.log('  brokenImg:', e));
      (r.externalAvatarIssues || []).slice(0, 2).forEach((e) => console.log('  extAvatar (Google, expired):', e));
      if (r.horizontalOverflow || r.blankScreen) console.log(`  layout: overflow=${r.horizontalOverflow} blank=${r.blankScreen}`);
    }
  } else {
    console.log('\nAll checks PASS 🎉');
  }
  console.log('\nReport saved: scripts/deep-qa-report.json');
}

main().catch((e) => {
  console.error('QA script crashed:', e);
  process.exit(1);
});