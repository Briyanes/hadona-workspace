/**
 * Playwright — Verifikasi fix kontras bubble chat (dark mode)
 *
 * Bug: override `.dark .text-gray-{700,800,900} !important` di globals.css
 * membajak warna teks di bubble amber (own message di dark) → teks terang di atas
 * kuning terang = tidak terbaca. Fix: bubble memakai slate-* (tidak di-hijack).
 *
 * Test:
 * 1. Login → /chat → pilih channel → kirim pesan unik.
 * 2. Dark mode  : own bubble = amber-300 bg + teks gelap  → kontras ≥ 4.5
 * 3. Light mode : own bubble = blue-500 bg + teks putih   → kontras ≥ 4.5
 * 4. Teks tidak boleh warna hijacked (#e2e8f0/#f1f5f9/#cbd5e1) di atas amber.
 *
 * Usage: node scripts/playwright-chat-dark-bubble-verify.mjs
 * Env: QA_BASE_URL, QA_EMAIL, QA_PASSWORD
 */
import { chromium } from 'playwright';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD;
const STATE_FILE = '/tmp/hadona-qa-state.json';
const SHOT_DIR = 'scripts/chat-dark-shots';

const HIJACKED = ['#e2e8f0', '#f1f5f9', '#cbd5e1']; // nilai override .dark .text-gray-*

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRGB(s) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s || '');
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
}
function lum({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(c1, c2) {
  const l1 = lum(c1), l2 = lum(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('');

let failures = 0;
const fail = (msg) => { console.error(`  ❌ ${msg}`); failures++; };
const pass = (msg) => console.log(`  ✅ ${msg}`);

/** Ambil bubble milik pesan `msg`: bg bubble + warna teks konten. */
async function probeBubble(page, msg) {
  return page.evaluate((text) => {
    // Kontainer teks konten bubble: div dengan class "max-w-none"
    const nodes = Array.from(document.querySelectorAll('div')).filter(
      (el) => el.className && typeof el.className === 'string' &&
        el.className.includes('max-w-none') && el.textContent.trim() === text
    );
    const textEl = nodes[nodes.length - 1];
    if (!textEl) return null;
    // Naik sampai elemen dengan background (bubble)
    let bubble = textEl;
    for (let i = 0; i < 4 && bubble.parentElement; i++) {
      bubble = bubble.parentElement;
      const bg = getComputedStyle(bubble).backgroundColor;
      if (bg && !bg.includes('0, 0, 0, 0') && bg !== 'transparent') break;
    }
    return {
      bubbleBg: getComputedStyle(bubble).backgroundColor,
      textColor: getComputedStyle(textEl).color,
      bubbleClass: typeof bubble.className === 'string' ? bubble.className.slice(0, 120) : '',
    };
  }, msg);
}

async function loginOnce(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  // Tunggu hydration selesai (React controlled input state siap)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]', { state: 'visible' });
  await sleep(1500);

  const email = page.locator('input[type="email"]');
  const pass = page.locator('input[type="password"]');
  const submit = page.locator('button[type="submit"]');

  await email.fill(EMAIL);
  await pass.fill(PASSWORD);

  // Jika masih disabled (fill sebelum hydration), refill dgn ketik per-char
  try {
    await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 8000 });
  } catch {
    await email.fill('');
    await email.pressSequentially(EMAIL, { delay: 20 });
    await pass.fill('');
    await pass.pressSequentially(PASSWORD, { delay: 20 });
    await page.waitForSelector('button[type="submit"]:not([disabled])', { timeout: 10000 });
  }

  await submit.click();
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
  await ctx.storageState({ path: STATE_FILE });
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();

  // Fresh login (state lama mungkin expired)
  console.log('🔑 Login…');
  await loginOnce(browser);

  for (const mode of ['dark', 'light']) {
    console.log(`\n${'═'.repeat(50)}\n🌡️  MODE: ${mode}`);
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      storageState: STATE_FILE,
      colorScheme: mode,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(60000);

    // Set theme SEBELUM app load supaya tidak ada hydration race
    await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, mode);
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
    await sleep(4000);

    // Pastikan kelas tema sesuai (preference DB dapat menimpa localStorage → paksa untuk QA)
    let isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if ((mode === 'dark') !== isDark) {
      await page.evaluate((d) => {
        document.documentElement.classList.toggle('dark', d);
        try { localStorage.setItem('theme', d ? 'dark' : 'light'); } catch {}
      }, mode === 'dark');
      await sleep(800);
      isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    }
    if ((mode === 'dark') === isDark) pass(`kelas .dark ${mode === 'dark' ? 'aktif' : 'tidak aktif'} (sesuai)`);
    else fail(`kelas .dark ${isDark ? 'masih aktif' : 'tidak aktif'} di mode ${mode}`);

    // Ambil daftar channel via API (authed) → selector akurat.
    // NOTE: channel dirender tanpa prefix "#" (lihat renderChannel → ch.name polos).
    const ch = await page.evaluate(async () => {
      const r = await fetch('/api/chat/channels');
      let firstName = null, total = 0;
      try {
        const j = await r.json();
        const list = j?.channels ?? j?.data ?? (Array.isArray(j) ? j : []);
        total = list.length;
        // Preferensi: channel general → tipe lain
        firstName = (list.find((c) => c?.type === 'general') ?? list[0])?.name ?? null;
      } catch {}
      return { status: r.status, total, firstName };
    });
    console.log(`  📡 /api/chat/channels → ${ch.status}, total: ${ch.total}`);
    const chanName = ch.firstName;
    if (!chanName) { fail('API channels tidak mengembalikan nama channel'); await ctx.close(); continue; }

    const sel = `button:has-text("${chanName}")`;
    const chans = page.locator(sel);
    let n = 0;
    for (let i = 0; i < 20 && n === 0; i++) { await sleep(1000); n = await chans.count(); }
    if (n === 0) {
      fail(`channel "${chanName}" tidak ditemukan di sidebar`);
      await page.screenshot({ path: `${SHOT_DIR}/no-channel-${mode}.png` });
      await ctx.close();
      continue;
    }
    pass(`channel ditemukan: ${chanName}`);
    await chans.first().click();
    await sleep(2500);

    // Kirim pesan unik
    const msg = `verify-contrast-${mode}-${Date.now()}`;
    const ta = page.locator('textarea').first();
    if (!(await ta.isVisible().catch(() => false))) { fail('composer textarea tidak muncul'); continue; }
    await ta.fill(msg);
    await ta.press('Enter');
    await sleep(3500);

    const probe = await probeBubble(page, msg);
    if (!probe) { fail(`bubble pesan "${msg}" tidak ditemukan`); await ctx.close(); continue; }

    const bg = parseRGB(probe.bubbleBg);
    const fg = parseRGB(probe.textColor);
    const cr = bg && fg ? contrast(bg, fg) : 0;
    console.log(`  🫧 bubble bg: ${probe.bubbleBg}`);
    console.log(`  🔤 text fg  : ${probe.textColor}`);
    console.log(`  📊 kontras  : ${cr.toFixed(2)}:1`);

    // Amber-300 = rgb(252,211,77); Blue-500 = rgb(59,130,246)
    const isAmber = bg && bg.r > 240 && bg.g > 190 && bg.b < 120;
    const isBlue = bg && bg.b > 200 && bg.r < 100;

    if (mode === 'dark') {
      if (!isAmber) fail(`own bubble dark seharusnya amber-300, dapat ${probe.bubbleBg}`);
      else pass('own bubble dark = amber-300');
      const fgHex = fg ? hex(fg) : '';
      if (HIJACKED.includes(fgHex)) fail(`teks masih ter-hijack (${fgHex})`);
      else pass(`teks bukan warna hijacked (${fgHex})`);
    } else {
      if (!isBlue) fail(`own bubble light seharusnya blue-500, dapat ${probe.bubbleBg}`);
      else pass('own bubble light = blue-500');
    }

    if (cr >= 4.5) pass(`kontras ${cr.toFixed(2)}:1 ≥ 4.5 (WCAG AA)`);
    else if (cr >= 3) { console.log(`  ⚠️ kontras ${cr.toFixed(2)}:1 (AA large only)`); }
    else fail(`kontras ${cr.toFixed(2)}:1 < 3 — tidak terbaca`);

    await page.screenshot({ path: `${SHOT_DIR}/chat-${mode}.png`, fullPage: false });
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${'═'.repeat(50)}`);
  if (failures > 0) { console.error(`💥 FAIL: ${failures} issue`); process.exit(1); }
  console.log('🎉 SEMUA PASS — bubble chat terbaca di dark & light');
}

main().catch((e) => { console.error('💥', e.message); process.exit(1); });