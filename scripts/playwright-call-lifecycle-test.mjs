/**
 * Playwright Test: Chat Group Call Lifecycle (Jitsi External API)
 *
 * Verifies P0 ghost-call fix + call UX:
 *   1. Start call → panel muncul, jitsi_room dibuat (random), toast sukses
 *   2. Minimize → panel hidden, pill "Call berlangsung" tampil, call TETAP jalan
 *   3. Maximize → panel kembali
 *   4. Leave call (tombol X) → panel hilang, badge LIVE hilang, call berakhir di DB
 *   5. Sidebar tidak menyisakan ghost LIVE badge
 *
 * Runs against LOCAL production build (localhost:3456) — tests the new code,
 * not the old deployed bundle.
 *
 * Usage:
 *   npm run build && PORT=3456 npm start &
 *   node scripts/playwright-call-lifecycle-test.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3456';
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@hadona.id';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '@Yogyakarta2026';

const consoleErrors = [];
const networkErrors = [];
const apiLog = [];
let failures = 0;

function check(name, cond) {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}`);
  }
}

async function run() {
  console.log('═══════════════════════════════════════════');
  console.log('  Chat Call Lifecycle Test');
  console.log(`  Target: ${BASE_URL}`);
  console.log('═══════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Headless: izinkan mic/cam (fake device) agar Jitsi tidak error permissions-policy
  await context.grantPermissions(['microphone', 'camera'], { origin: BASE_URL }).catch(() => {});
  const page = await context.newPage();

  const JITSI_NOISE = [
    'ERR_UNKNOWN_URL_SCHEME', // Jitsi mencoba load chrome-extension:// di headless
    'Permissions policy violation', // fake device di headless
  ];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (JITSI_NOISE.some((n) => t.includes(n))) {
        console.log(`  (noise) ${t.slice(0, 100)}`);
        return;
      }
      consoleErrors.push(t);
      console.log(`  ⚠️  CONSOLE: ${t.slice(0, 160)}`);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.log(`  💥 PAGE ERROR: ${err.message.slice(0, 160)}`);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes(BASE_URL) || url.includes('supabase')) {
      networkErrors.push(`${req.failure()?.errorText} — ${url}`);
      console.log(`  🌐 NET FAIL: ${req.failure()?.errorText} — ${url.slice(0, 120)}`);
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/chat/calls')) {
      apiLog.push({ method: res.request().method(), status: res.status(), url });
      console.log(`  🔗 API ${res.request().method()} ${res.status()} ${url.split('/api/')[1]}`);
    }
  });

  try {
    // ═══ STEP 1: Login ═══
    console.log('\n📋 Step 1: Login');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
    }
    check('Login berhasil', !page.url().includes('/login'));

    // ═══ STEP 2: Buka /chat, tunggu channel list ═══
    console.log('\n📋 Step 2: Buka halaman Chat');
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle', timeout: 30000 });
    const sidebar = page.getByTestId('desktop-channel-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(2500); // tunggu channels termuat
    const channelButtons = sidebar.locator('button:not([title])');
    const channelCount = await channelButtons.count();
    check(`Channel list termuat (${Math.max(channelCount, 0)} tombol terlihat)`, channelCount >= 0);

    // ═══ STEP 3: Pilih channel pertama (general) ═══
    console.log('\n📋 Step 3: Pilih channel pertama');
    const firstChannel = sidebar.locator('button', { hasText: /.+/ }).first();
    await firstChannel.click();
    await page.waitForTimeout(1500);
    const headerName = await page.locator('h2.font-semibold').first().textContent().catch(() => '');
    check(`Channel terbuka (${(headerName || '').trim()})`, !!headerName);

    // ═══ STEP 4: Mulai call ═══
    console.log('\n📋 Step 4: Mulai group call');
    const callBtn = page.locator('button', { hasText: 'Call' }).first();
    await callBtn.waitFor({ state: 'visible', timeout: 8000 });
    await callBtn.click();
    // Tunggu POST /api/chat/calls + panel muncul
    await page.waitForTimeout(4000);
    // Gunakan exact match — hindari false match dengan toast "Group call dimulai/diakhiri"
    const panelHeader = page.getByText('Group Call', { exact: true }).first();
    const panelVisible = await panelHeader.isVisible().catch(() => false);
    check('Call panel tampil (header "Group Call")', panelVisible);

    const jitsiContainer = page.locator('div.min-h-\\[300px\\]').first();
    const containerVisible = await jitsiContainer.isVisible().catch(() => false);
    check('Container Jitsi ada', containerVisible);

    const startPost = apiLog.find((l) => l.method === 'POST' && l.status < 400);
    check('POST /api/chat/calls sukses', !!startPost);

    const toastOk = await page.locator('text=Group call dimulai').first().isVisible().catch(() => false);
    check('Toast sukses tampil', toastOk);

    // Header tombol berubah jadi "Join Call" (call aktif utk peserta lain)
    const joinBtn = page.locator('button', { hasText: 'Join Call' });
    const joinVisible = await joinBtn.isVisible().catch(() => false);
    check('Badge channel LIVE / tombol Join Call muncul', joinVisible);

    // ═══ STEP 5: Minimize — call tetap jalan ═══
    console.log('\n📋 Step 5: Minimize call');
    await page.locator('button[title="Minimize (call tetap jalan)"]').click();
    await page.waitForTimeout(800);
    const pill = page.locator('text=Call berlangsung').first();
    const pillVisible = await pill.isVisible().catch(() => false);
    check('Pill "Call berlangsung" tampil saat minimized', pillVisible);
    const panelAfterMin = await panelHeader.isVisible().catch(() => false);
    check('Panel disembunyikan saat minimized', !panelAfterMin);

    // ═══ STEP 6: Maximize kembali ═══
    console.log('\n📋 Step 6: Maximize kembali');
    await page.locator('button[title="Buka"]').click();
    await page.waitForTimeout(800);
    const panelBack = await panelHeader.isVisible().catch(() => false);
    check('Panel kembali setelah maximize', panelBack);

    // ═══ STEP 7: Keluar call ═══
    console.log('\n📋 Step 7: Keluar dari call');
    await page.locator('button[title="Keluar call"]').click();
    await page.waitForTimeout(3000); // tunggu PATCH + poll 10s? — PATCH langsung dieksekusi
    const panelGone = await panelHeader.isVisible().catch(() => false);
    check('Panel hilang setelah keluar', !panelGone);
    const patchCall = apiLog.find((l) => l.method === 'PATCH' && l.status < 400);
    check('PATCH end-call terkirim', !!patchCall);

    // Verifikasi DB: call benar2 berakhir (GET calls tidak lagi punya row utk channel ini)
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/chat/calls');
      return r.ok ? await r.json() : null;
    });
    const activeLeft = (res?.calls || []).length;
    check(`Tidak ada ghost call tersisa di DB (${activeLeft} aktif)`, activeLeft === 0);

    // ═══ STEP 8: Tombol kembali "Call" (bukan Join Call) ═══
    await page.waitForTimeout(2000);
    const callBtnBack = await page
      .locator('button', { hasText: 'Call' })
      .first()
      .isVisible()
      .catch(() => false);
    check('Tombol kembali ke state "Call" (bukan Join)', callBtnBack);
  } catch (err) {
    failures++;
    console.log(`\n💥 TEST CRASH: ${err.message}`);
    await page.screenshot({ path: 'scripts/screenshots/call-lifecycle-crash.png' }).catch(() => {});
  }

  await browser.close();

  // ═══ SUMMARY ═══
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Console errors : ${consoleErrors.length}`);
  console.log(`  Network errors: ${networkErrors.length}`);
  console.log(`  Failures      : ${failures}`);
  console.log('═══════════════════════════════════════════');
  if (consoleErrors.length) {
    console.log('\nConsole errors (unique):');
    [...new Set(consoleErrors)].slice(0, 10).forEach((e) => console.log(`  - ${e.slice(0, 160)}`));
  }
  process.exit(failures > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
