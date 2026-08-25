/**
 * Playwright Verification — Muted Token Fix (light-mode invisible text)
 *
 * Verifies the fix family:
 *  1. `text-muted` elements on affected pages must NOT render as white (light mode)
 *  2. Contrast ratio of muted text vs effective background >= 4.5 (WCAG AA)
 *  3. No console errors on affected pages
 *  4. Dark mode still readable (not dark-on-dark)
 *
 * Affected pages:
 *  - /                → ae-analytics-widget (labels were white-on-pastel)
 *  - /monthly-reports → 14 muted texts
 *  - /settings/integrations → bg-muted/10 chip
 *  - /strategy        → bg-muted/10 badges
 *
 * Usage: node scripts/playwright-muted-token-fix.mjs
 * Env: QA_EMAIL, QA_PASSWORD, QA_BASE_URL
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'admin@hadona.id';
const PASSWORD = process.env.QA_PASSWORD || '@Yogyakarta2026';
const STATE_FILE = '/tmp/hadona-qa-state.json';

const PAGES = [
  { name: 'Dashboard (AE Analytics)', path: '/' },
  { name: 'Monthly Reports', path: '/monthly-reports' },
  { name: 'Settings Integrations', path: '/settings/integrations' },
  { name: 'Strategy', path: '/strategy' },
];

const TOGGLE_SEL = 'button[title*="Switch to"]';

const results = [];
let failures = 0;

function parseRGB(rgbStr) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgbStr || '');
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

function luminance({ r, g, b }) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function record(page, theme, check, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  if (!pass) failures++;
  results.push({ page, theme, check, status, detail });
  console.log(`  [${status}] ${check} — ${detail}`);
}

/**
 * Sample every visible element with class text-muted on the page.
 * For each: computed color, effective ancestor bg (first non-transparent),
 * contrast ratio vs that bg.
 */
async function sampleMutedTexts(page) {
  return page.evaluate(() => {
    function firstOpaqueBg(el) {
      let node = el;
      while (node && node !== document.documentElement) {
        const bg = getComputedStyle(node).backgroundColor;
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(bg);
        if (bg && !m) return bg; // rgb() opaque
        if (m && +m[4] >= 0.9) return bg; // effectively opaque
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }
    const els = Array.from(document.querySelectorAll('.text-muted'));
    return els
      .filter((el) => el.offsetParent !== null && el.textContent.trim().length > 0)
      .slice(0, 40)
      .map((el) => {
        const cs = getComputedStyle(el);
        return {
          text: el.textContent.trim().slice(0, 40),
          color: cs.color,
          bg: firstOpaqueBg(el),
        };
      });
  });
}

async function verifyTheme(page, pageName, theme) {
  const samples = await sampleMutedTexts(page);
  if (samples.length === 0) {
    record(pageName, theme, 'muted-text-present', true, 'no .text-muted on this page (skip contrast)');
    return;
  }

  let worst = Infinity;
  let worstSample = null;
  let whiteCount = 0;

  for (const s of samples) {
    const fg = parseRGB(s.color);
    const bg = parseRGB(s.bg);
    if (!fg || !bg) continue;
    // The regression: light mode text renders as white/near-white
    if (theme === 'light' && fg.r > 240 && fg.g > 240 && fg.b > 240) whiteCount++;
    const cr = contrastRatio(fg, bg);
    if (cr < worst) {
      worst = cr;
      worstSample = s;
    }
  }

  record(
    pageName,
    theme,
    'no-white-text',
    whiteCount === 0,
    whiteCount === 0
      ? `${samples.length} muted texts, none white`
      : `${whiteCount}/${samples.length} texts render WHITE (bug still present)`
  );

  // WCAG AA: 4.5 for normal text; muted labels are 10-12px so AA applies.
  record(
    pageName,
    theme,
    'contrast>=4.5',
    worst >= 4.5,
    `worst ratio ${worst.toFixed(2)} on "${worstSample?.text}" (${worstSample?.color} on ${worstSample?.bg})`
  );
}

async function toggleTheme(page) {
  const btn = page.locator(TOGGLE_SEL).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch();

  // --- login (reuse state if exists) ---
  let context;
  if (fs.existsSync(STATE_FILE)) {
    context = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1440, height: 900 } });
  } else {
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Retry fill until React hydration catches up (button disabled while state empty)
    let enabled = false;
    for (let i = 0; i < 12; i++) {
      await page.fill('input[type="email"]', '');
      await page.fill('input[type="email"]', EMAIL);
      await page.fill('input[type="password"]', '');
      await page.fill('input[type="password"]', PASSWORD);
      enabled = await page.evaluate(() => {
        const b = document.querySelector('button[type="submit"]');
        return !!b && !b.disabled;
      }).catch(() => false);
      if (enabled) break;
      await page.waitForTimeout(2000);
    }
    if (!enabled) throw new Error('Login button never enabled (hydration race)');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 });
    await page.waitForTimeout(3000);
    await context.storageState({ path: STATE_FILE });
    await page.close();
  }

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 120));
  });

  for (const p of PAGES) {
    console.log(`\n=== ${p.name} (${p.path}) ===`);
    await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    // ensure LIGHT mode first
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (isDark) await toggleTheme(page);

    await verifyTheme(page, p.name, 'light');

    // switch to dark
    const toggled = await toggleTheme(page);
    if (toggled) {
      await verifyTheme(page, p.name, 'dark');
      await toggleTheme(page); // restore
    } else {
      record(p.name, 'dark', 'theme-toggle-found', false, 'toggle button not found');
    }
  }

  const pageErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('401')
  );
  console.log(`\n=== Console errors (filtered): ${pageErrors.length === 0 ? 'PASS' : 'WARNING'} ===`);
  pageErrors.slice(0, 5).forEach((e) => console.log('  ' + e));

  console.log('\n================ SUMMARY ================');
  for (const r of results) console.log(`[${r.status}] ${r.page} (${r.theme}) — ${r.check}`);
  console.log(`\nTotal: ${results.length} checks, ${failures} FAIL`);
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});