/**
 * Playwright Theme (Dark/Light) Visual Audit
 * - Login sekali (storageState reuse, hindari rate-limit Supabase).
 * - Untuk tiap halaman representatif: cek light → toggle dark → cek dark → toggle balik.
 * - Validasi: kelas .dark pada <html>, perubahan warna body (luminance), kontras teks inti,
 *   screenshot kedua tema ke scripts/theme-audit-shots/.
 *
 * Usage: node scripts/playwright-theme-audit.mjs
 * Env: QA_EMAIL, QA_PASSWORD, QA_BASE_URL
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL || 'admin@hadona.id';
const PASSWORD = process.env.QA_PASSWORD || '@Yogyakarta2026';
const STATE_FILE = '/tmp/hadona-qa-state.json';
const SHOT_DIR = 'scripts/theme-audit-shots';

const PAGES = [
  { name: 'Dashboard', path: '/' },
  { name: 'Tasks', path: '/tasks' },
  { name: 'Clients', path: '/clients' },
  { name: 'Reports', path: '/reports' },
  { name: 'Ads Spend', path: '/ads-spend' },
  { name: 'Settings', path: '/settings' },
];

const TOGGLE_SEL = 'button[title*="Switch to"]';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function sampleTheme(page) {
  return page.evaluate(() => {
    const htmlEl = document.documentElement;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const main = document.querySelector('main');
    const mainBg = main ? getComputedStyle(main).backgroundColor : null;
    // teks inti: heading terbesar visible + paragraf/label pertama
    const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find(
      (el) => el.offsetParent !== null && el.textContent.trim().length > 0
    );
    const headingColor = heading ? getComputedStyle(heading).color : null;
    const headingText = heading ? heading.textContent.trim().slice(0, 60) : null;
    return {
      hasDarkClass: htmlEl.classList.contains('dark'),
      bodyBg,
      mainBg,
      headingColor,
      headingText,
    };
  });
}

async function bootstrapLogin(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Retry fill until React hydration catches up (button disabled while state empty)
  let enabled = false;
  for (let i = 0; i < 12; i++) {
    await page.fill('#email', '');
    await page.fill('#email', EMAIL);
    await page.fill('#password', '');
    await page.fill('#password', PASSWORD);
    enabled = await page
      .evaluate(() => {
        const b = document.querySelector('button[type="submit"]');
        return !!b && !b.disabled;
      })
      .catch(() => false);
    if (enabled) break;
    await sleep(2000);
  }
  if (!enabled) throw new Error('Login button never enabled (hydration race)');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 60000 });
  await sleep(2500);
  await context.storageState({ path: STATE_FILE });
  await context.close();
  console.log('Bootstrap login OK.');
}

async function audit() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();

  if (!fs.existsSync(STATE_FILE)) await bootstrapLogin(browser);

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: STATE_FILE,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const results = [];
  let themeNow = 'light'; // asumsi default; diverifikasi per halaman

  for (const p of PAGES) {
    const entry = { page: p.name, path: p.path, status: 'PASS', issues: [] };
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(3500);

      // --- LIGHT ---
      const light = await sampleTheme(page);
      if (light.hasDarkClass) {
        // default ternyata dark (persist) — anggap tema awal = dark
        themeNow = 'dark';
      }
      entry.light = light;
      await page.screenshot({ path: `${SHOT_DIR}/${p.name.toLowerCase().replace(/\s+/g, '-')}-light.png` });

      // --- TOGGLE ---
      const toggle = page.locator(TOGGLE_SEL).first();
      if (!(await toggle.count())) {
        entry.status = 'FAIL';
        entry.issues.push('Tombol toggle tema tidak ditemukan');
        results.push(entry);
        continue;
      }
      await toggle.click();
      await sleep(1200);

      const dark = await sampleTheme(page);
      entry.dark = dark;
      await page.screenshot({ path: `${SHOT_DIR}/${p.name.toLowerCase().replace(/\s+/g, '-')}-dark.png` });

      // --- VALIDASI ---
      const before = themeNow === 'dark' ? dark : light;
      const after = themeNow === 'dark' ? light : dark;

      // 1. kelas .dark harus berubah
      if (before.hasDarkClass === after.hasDarkClass) {
        entry.status = 'FAIL';
        entry.issues.push('Toggle tidak mengubah kelas .dark pada <html>');
      }

      // 2. warna body harus berubah & sesuai tema
      const bgBefore = parseRGB(before.bodyBg);
      const bgAfter = parseRGB(after.bodyBg);
      if (!bgAfter || !bgBefore || (bgBefore.r === bgAfter.r && bgBefore.g === bgAfter.g && bgBefore.b === bgAfter.b)) {
        entry.status = 'WARNING';
        entry.issues.push('Background body tidak berubah antar tema');
      } else {
        // tema gelap harus punya luminance rendah pada bg utama
        const darkOne = before.hasDarkClass ? bgBefore : bgAfter;
        if (luminance(darkOne) > 0.35) {
          entry.status = 'WARNING';
          entry.issues.push(`Tema gelap terlihat terang (luminance ${luminance(darkOne).toFixed(2)}) — mungkin warna tidak menerapkan dark:`);
        }
      }

      // 3. kontras teks heading di masing-masing tema
      for (const [label, snap] of [['light', themeNow === 'dark' ? dark : light], ['dark', themeNow === 'dark' ? light : dark]]) {
        const fg = parseRGB(snap.headingColor);
        const bg = parseRGB(snap.mainBg || snap.bodyBg);
        if (fg && bg && fg.a !== 0 && bg.a !== 0) {
          const ratio = contrastRatio(fg, bg);
          if (ratio < 3) {
            if (entry.status === 'PASS') entry.status = 'WARNING';
            entry.issues.push(`Kontras heading (${label}) rendah: ${ratio.toFixed(2)}:1 — "${snap.headingText}"`);
          }
        }
      }

      // --- kembalikan ke tema awal untuk halaman berikutnya ---
      await toggle.click();
      await sleep(600);
    } catch (err) {
      entry.status = 'FAIL';
      entry.issues.push(String(err.message || err).slice(0, 250));
    }
    results.push(entry);
    console.log(`[${entry.status}] ${entry.page}${entry.issues.length ? ' — ' + entry.issues.join(' | ') : ''}`);
  }

  await context.close();
  await browser.close();

  fs.writeFileSync('scripts/theme-audit-report.json', JSON.stringify(results, null, 2));
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARNING').length;
  console.log(`\nSelesai: ${results.length} halaman — PASS ${results.length - fail - warn}, WARNING ${warn}, FAIL ${fail}`);
  console.log(`Screenshot: ${SHOT_DIR}/ · Report: scripts/theme-audit-report.json`);
}

audit().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});