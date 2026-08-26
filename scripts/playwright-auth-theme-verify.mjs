/**
 * Playwright Auth Pages Theme Verification
 * Verifies text-primary-foreground token fix on public auth pages (/login, /signup)
 * after dark-mode yellow primary made hardcoded text-white invisible.
 *
 * Checks per page per theme (light/dark):
 *  - html.dark class present/absent as expected
 *  - first element with .text-primary-foreground has correct computed color:
 *      light: rgb(255, 255, 255)  (white on blue #2B46BB)
 *      dark:  rgb(15, 23, 42)     (dark on yellow #FFD60A)
 *  - WCAG contrast ratio of that text vs gradient start color >= 4.5
 *  - screenshot saved to scripts/auth-theme-shots/
 *
 * Usage: node scripts/playwright-auth-theme-verify.mjs
 * Env:   QA_BASE_URL (default https://workspace.hadona.id)
 */
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.QA_BASE_URL || 'https://workspace.hadona.id';
const SHOT_DIR = 'scripts/auth-theme-shots';

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'signup', path: '/signup' },
];

const THEMES = [
  { name: 'light', expectDark: false, expectedText: 'rgb(255, 255, 255)' },
  { name: 'dark', expectDark: true, expectedText: 'rgb(15, 23, 42)' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRGB(rgbStr) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || '');
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3] };
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

async function sample(page) {
  return page.evaluate(() => {
    const isDark = document.documentElement.classList.contains('dark');
    // find first visible element with the token class
    const els = Array.from(
      document.querySelectorAll('.text-primary-foreground')
    );
    let target = null;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && style.visibility !== 'hidden') {
        target = el;
        break;
      }
    }
    let textColor = null;
    let gradientStart = null;
    if (target) {
      textColor = getComputedStyle(target).color;
      // walk up to find gradient bg container
      let node = target;
      while (node && node !== document.body) {
        const bg = getComputedStyle(node).backgroundImage;
        if (bg && bg.includes('gradient') && bg.includes('rgb')) {
          const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
          if (m) gradientStart = `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
          break;
        }
        node = node.parentElement;
      }
    }
    return { isDark, textColor, gradientStart, tokenCount: els.length };
  });
}

fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
let failures = 0;

for (const p of PAGES) {
  for (const t of THEMES) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    // set theme BEFORE any page script runs
    await ctx.addInitScript((theme) => {
      try { localStorage.setItem('theme', theme); } catch {}
    }, t.name);
    const page = await ctx.newPage();
    const label = `${p.name} [${t.name}]`;
    try {
      await page.goto(`${BASE}${p.path}`, {
        waitUntil: 'networkidle',
        timeout: 45000,
      });
      await sleep(800); // theme provider settle
      const s = await sample(page);
      const issues = [];
      if (s.isDark !== t.expectDark) issues.push(`html.dark=${s.isDark}`);
      if (!s.textColor) {
        issues.push('no .text-primary-foreground element found');
      } else if (s.textColor !== t.expectedText) {
        issues.push(`text=${s.textColor} expected=${t.expectedText}`);
      }
      if (s.textColor && s.gradientStart) {
        const ratio = contrastRatio(
          parseRGB(s.textColor),
          parseRGB(s.gradientStart)
        );
        if (ratio < 4.5) issues.push(`contrast=${ratio.toFixed(2)}<4.5`);
      }
      await page.screenshot({
        path: `${SHOT_DIR}/${p.name}-${t.name}.png`,
        fullPage: false,
      });
      if (issues.length) {
        failures++;
        console.log(`FAIL  ${label} :: ${issues.join('; ')} (tokens=${s.tokenCount}, bg=${s.gradientStart})`);
      } else {
        const ratio =
          s.textColor && s.gradientStart
            ? contrastRatio(parseRGB(s.textColor), parseRGB(s.gradientStart)).toFixed(2)
            : 'n/a';
        console.log(`PASS  ${label} :: text=${s.textColor} bg=${s.gradientStart} contrast=${ratio}`);
      }
    } catch (e) {
      failures++;
      console.log(`ERROR ${label} :: ${e.message.split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
}

await browser.close();
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);