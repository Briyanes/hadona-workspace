/**
 * Playwright Test: AE Meeting Flow (post Google Cloud migration)
 *
 * Verifies the FULL meeting flow at /calendar:
 *   1. Login
 *   2. Google connection status (/api/google/status)
 *   3. Open "Buat Event / Meeting" modal
 *   4. Fill form (title, type=client_meeting, client, datetime, location)
 *   5. IF google connected   → check auto-generate Meet, submit,
 *      verify "Meeting Berhasil Dibuat!" modal + meet link + Copy toast + WA/email block
 *      ELSE (fallback)       → verify manual Meet link input exists / event saves without link
 *   6. Screenshots + PASS/FAIL/SKIP report per checkpoint
 *
 * Usage:
 *   TEST_EMAIL=xxx TEST_PASSWORD=xxx \
 *   BASE_URL=https://workspace.hadona.id \
 *   node scripts/playwright-meeting-flow-test.mjs
 *
 * Env:
 *   BASE_URL       (default https://workspace.hadona.id)
 *   TEST_EMAIL     required
 *   TEST_PASSWORD  required
 *   HEADLESS       "true" (default) | "false" to watch the browser
 *   CLEANUP        "true" (default) — delete test events created by this run
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://workspace.hadona.id';
const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';
const SHOT_DIR = 'scripts/screenshots/meeting-flow-test';

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('❌ Set TEST_EMAIL and TEST_PASSWORD env vars first!');
  console.error('   Usage: TEST_EMAIL=xxx TEST_PASSWORD=xxx node scripts/playwright-meeting-flow-test.mjs');
  process.exit(1);
}

// ─── Reporting helpers ───
const results = [];
function report(name, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️ ';
  results.push({ name, status, detail });
  console.log(`  ${icon} [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const consoleErrors = [];
const networkErrors = [];
const toasts = [];

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('  AE Meeting Flow Test (Google Meet)');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Headless: ${HEADLESS}`);
  console.log('═══════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  // ─── Capture diagnostics ───
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log(`  💥 CONSOLE: ${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log(`  💥 PAGE ERR: ${err.message.slice(0, 200)}`);
  });
  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('hadona') || url.includes('google')) {
      networkErrors.push(`${req.failure()?.errorText} — ${url}`);
      console.log(`  🌐 NET FAIL: ${req.failure()?.errorText} — ${url.slice(0, 120)}`);
    }
  });
  page.on('response', res => {
    if (res.url().includes('/api/google/create-meet') || res.url().includes('/api/calendar')) {
      console.log(`  📡 API ${res.status()}: ${res.request().method()} ${res.url().split('/api')[1]}`);
    }
  });

  // ─── Capture toasts (sonner) ───
  await page.exposeFunction('captureToast', text => {
    toasts.push(text);
    console.log(`  📢 TOAST: ${text}`);
  });
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      document.querySelectorAll('[data-sonner-toast]').forEach(el => {
        const text = el.textContent;
        if (text && !window._capturedToasts?.has(text)) {
          window._capturedToasts = window._capturedToasts || new Set();
          window._capturedToasts.add(text);
          window.captureToast(text);
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  let googleConnected = false;
  const testTitle = `[QA] Meeting Flow Test — ${Date.now()}`;

  try {
    // ═══ STEP 1: Login ═══
    console.log('\n📋 Step 1: Login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);

    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
    }

    if (page.url().includes('/login')) {
      await page.screenshot({ path: `${SHOT_DIR}/00-login-failed.png`, fullPage: true });
      report('Login', 'FAIL', 'Masih di halaman login — cek kredensial');
      throw new Error('Login gagal');
    }
    report('Login', 'PASS', `Redirected to ${page.url().replace(BASE_URL, '')}`);

    // ═══ STEP 2: Google connection status ═══
    console.log('\n📋 Step 2: Check Google connection...');
    const statusRes = await page.evaluate(async () => {
      const res = await fetch('/api/google/status');
      return res.json().catch(() => ({}));
    });
    googleConnected = Boolean(statusRes?.connected);
    console.log(`  Google status API: ${JSON.stringify(statusRes).slice(0, 200)}`);
    report(
      'Google Connection Status',
      googleConnected ? 'PASS' : 'SKIP',
      googleConnected
        ? 'Terhubung — akan test auto-generate Meet'
        : 'BELUM terhubung — test jalur manual link. AE perlu re-connect di Settings → Integrations (OAuth client baru pasca-migrasi GCP)'
    );

    // ═══ STEP 3: Open Calendar & event modal ═══
    console.log('\n📋 Step 3: Open Calendar → "Buat Event / Meeting"...');
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOT_DIR}/01-calendar.png`, fullPage: true });
    report('Calendar page load', 'PASS');

    const newEventBtn = page.locator('button', { hasText: /new event|buat event/i }).first();
    await newEventBtn.waitFor({ state: 'visible', timeout: 10000 });
    await newEventBtn.click();
    await page.waitForTimeout(1000);

    const modalTitle = page.locator('text=Buat Event / Meeting').first();
    const modalOpen = await modalTitle.isVisible().catch(() => false);
    await page.screenshot({ path: `${SHOT_DIR}/02-modal-open.png`, fullPage: true });
    report('Modal "Buat Event / Meeting" terbuka', modalOpen ? 'PASS' : 'FAIL');
    if (!modalOpen) throw new Error('Modal tidak terbuka');

    // ═══ STEP 4: Fill form ═══
    console.log('\n📋 Step 4: Fill event form...');

    // Title
    const titleInput = page.locator('input[placeholder*="Monthly Meeting"], input[placeholder*="Judul"]').first();
    await titleInput.fill(testTitle);
    report('Judul terisi', 'PASS', testTitle);

    // Event type → client_meeting
    const typeSelect = page.locator('select').first();
    try {
      await typeSelect.selectOption('client_meeting');
      report('Tipe event = client_meeting', 'PASS');
    } catch {
      report('Tipe event = client_meeting', 'FAIL', 'Option client_meeting tidak ditemukan');
    }
    await page.waitForTimeout(500);

    // Client (muncul setelah tipe = client_meeting)
    try {
      const clientSelect = page.locator('select').nth(1);
      const options = await clientSelect.locator('option').allTextContents();
      const validOpts = options.filter(o => o && !o.toLowerCase().includes('pilih'));
      if (validOpts.length > 0) {
        await clientSelect.selectOption({ index: Math.min(1, options.length - 1) });
        report('Client dipilih', 'PASS', validOpts[0]?.slice(0, 40));
      } else {
        report('Client dipilih', 'SKIP', 'Tidak ada client tersedia');
      }
    } catch (e) {
      report('Client dipilih', 'SKIP', `Select client tidak ditemukan (${e.message.split('\n')[0]})`);
    }

    // Datetimes (tomorrow 10:00–11:00)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
    const fmtEnd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T11:00`;
    const dtInputs = page.locator('input[type="datetime-local"]');
    const dtCount = await dtInputs.count();
    if (dtCount > 0) await dtInputs.first().fill(fmt(tomorrow));
    if (dtCount > 1) await dtInputs.nth(1).fill(fmtEnd(tomorrow));
    report('Waktu mulai & selesai terisi', dtCount > 1 ? 'PASS' : dtCount === 1 ? 'PASS' : 'FAIL', `${dtCount} datetime input ditemukan`);

    // Location
    try {
      await page.locator('input[placeholder*="Kantor"], input[placeholder*="Lokasi"]').first()
        .fill('QA Test Location', { timeout: 3000 });
      report('Lokasi terisi', 'PASS');
    } catch {
      report('Lokasi terisi', 'SKIP', 'Field lokasi tidak ditemukan');
    }

    // ═══ STEP 5: Auto-Meet / manual link ═══
    let autoMeetChecked = false;
    if (googleConnected) {
      console.log('\n📋 Step 5a: Check "Auto-generate Google Meet"...');
      const meetToggle = page.locator('label', { hasText: /auto-generate google meet|google meet/i })
        .locator('input[type="checkbox"]').first();
      try {
        await meetToggle.waitFor({ state: 'visible', timeout: 5000 });
        await meetToggle.check({ force: true });
        autoMeetChecked = true;
        report('Checkbox auto-generate Meet dicentang', 'PASS');
      } catch {
        // Mungkin berupa toggle component
        const toggleBtn = page.locator('text=/auto-generate google meet/i').first();
        const hasToggle = await toggleBtn.isVisible().catch(() => false);
        if (hasToggle) { await toggleBtn.click(); autoMeetChecked = true; report('Toggle auto-Meet aktif', 'PASS'); }
        else report('Checkbox auto-generate Meet', 'FAIL', 'Google connected tapi toggle tidak muncul');
      }
    } else {
      console.log('\n📋 Step 5a (fallback): Manual Meet link input...');
      const manualLink = page.locator('input[placeholder*="meet.google.com"], input[placeholder*="Meet link"]').first();
      const hasManual = await manualLink.isVisible().catch(() => false);
      if (hasManual) {
        await manualLink.fill('https://meet.google.com/qa-test-link');
        report('Input manual Meet link tersedia & terisi', 'PASS');
      } else {
        report('Input manual Meet link', 'SKIP', 'Field manual link tidak tampil (event tanpa link)');
      }
    }

    await page.screenshot({ path: `${SHOT_DIR}/03-form-filled.png`, fullPage: true });

    // ═══ STEP 6: Submit ═══
    console.log('\n📋 Step 6: Submit event...');
    const submitBtn = page.locator('button[type="submit"]', { hasText: /buat event|simpan/i }).first();
    await submitBtn.click();

    // Tunggu max 15s: modal sukses ATAU modal form tertutup
    let successModalVisible = false;
    try {
      await page.locator('text=Meeting Berhasil Dibuat!').first()
        .waitFor({ state: 'visible', timeout: 15000 });
      successModalVisible = true;
    } catch { /* modal sukses tidak muncul dalam 15s */ }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOT_DIR}/04-after-submit.png`, fullPage: true });

    if (googleConnected && autoMeetChecked) {
      // ═══ STEP 7: Verify success modal + link + copy + WA ═══
      console.log('\n📋 Step 7: Verify success modal, link, Copy, WA/email...');
      report('Modal "Meeting Berhasil Dibuat!" muncul', successModalVisible ? 'PASS' : 'FAIL');
      if (successModalVisible) {
        // Meet link terisi
        const linkInput = page.locator('input[readonly]').first();
        const linkVal = await linkInput.inputValue().catch(() => '');
        report('Link meeting terisi', /^https?:\/\/(meet\.google\.com|\S+)/.test(linkVal) ? 'PASS' : 'FAIL', linkVal.slice(0, 60));

        // Tombol Copy → toast
        const copyBtn = page.locator('button', { hasText: /^copy$/i }).first();
        const copyVisible = await copyBtn.isVisible().catch(() => false);
        report('Tombol "Copy" tersedia', copyVisible ? 'PASS' : 'FAIL');
        if (copyVisible) {
          await copyBtn.click();
          await page.waitForTimeout(1500);
          const copied = toasts.some(t => /disalin|clipboard/i.test(t));
          report('Toast "Link disalin ke clipboard!"', copied ? 'PASS' : 'FAIL');
          await page.screenshot({ path: `${SHOT_DIR}/05-copy-toast.png`, fullPage: true });
        }

        // Invite email / WA fallback
        const emailInvite = await page.locator('text=/invite google meet sudah dikirim/i').first().isVisible().catch(() => false);
        const waFallback = await page.locator('text=/kirim via whatsapp/i').first().isVisible().catch(() => false);
        const waBtn = await page.locator('a', { hasText: /whatsapp/i }).first().isVisible().catch(() => false);
        if (emailInvite) report('Invite email terkirim ke client', 'PASS');
        else if (waFallback || waBtn) report('Fallback WhatsApp ke client tersedia', 'PASS', waBtn ? 'Tombol "Buka WhatsApp" terlihat' : 'Info WA terlihat');
        else report('Invite/WA client', 'SKIP', 'Client tanpa email & nomor WA');
      }
    } else {
      // Jalur tanpa Google: modal form harus tertutup + toast sukses
      const formStillOpen = await page.locator('text=Buat Event / Meeting').first().isVisible().catch(() => false);
      const savedToast = toasts.some(t => /berhasil|success|dibuat/i.test(t));
      report('Event tersimpan (mode tanpa Google Meet)', (!formStillOpen || savedToast) ? 'PASS' : 'FAIL',
        savedToast ? 'Toast sukses terdeteksi' : 'Modal form tertutup');
    }

    // ═══ STEP 8: Event muncul di list ═══
    console.log('\n📋 Step 8: Event muncul di kalender/list...');
    await page.goto(`${BASE_URL}/calendar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const eventVisible = await page.locator(`text=${testTitle}`).first().isVisible().catch(() => false);
    report('Event tampil di Calendar', eventVisible ? 'PASS' : 'FAIL');
    await page.screenshot({ path: `${SHOT_DIR}/06-event-listed.png`, fullPage: true });

  } catch (err) {
    console.error(`\n💥 Test aborted: ${err.message}`);
    await page.screenshot({ path: `${SHOT_DIR}/error-state.png`, fullPage: true }).catch(() => {});
    report('Test execution', 'FAIL', err.message.split('\n')[0]);
  } finally {
    // ═══ FINAL REPORT ═══
    const pass = results.filter(r => r.status === 'PASS').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    const skip = results.filter(r => r.status === 'SKIP').length;

    console.log('\n═══════════════════════════════════════════════');
    console.log('  FINAL REPORT — AE Meeting Flow');
    console.log('═══════════════════════════════════════════════');
    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️ ';
      console.log(`  ${icon} ${r.status.padEnd(4)} | ${r.name}${r.detail ? ` → ${r.detail}` : ''}`);
    });
    console.log('───────────────────────────────────────────────');
    console.log(`  PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}`);
    console.log(`  Google connected : ${googleConnected ? 'YES (auto-Meet diuji)' : 'NO (jalur manual diuji)'}`);
    console.log(`  Console errors   : ${consoleErrors.length}`);
    console.log(`  Network errors   : ${networkErrors.length}`);
    console.log(`  Screenshots      : ${SHOT_DIR}/`);
    console.log('═══════════════════════════════════════════════\n');

    if (googleConnected === false) {
      console.log('💡 CATATAN: Google belum terhubung. Setelah migrasi Google Cloud, AE harus');
      console.log('   re-connect di Settings → Integrations agar tombol auto-generate Meet muncul.');
      console.log('   Lalu jalankan ulang test ini untuk verifikasi alur lengkap.\n');
    }

    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });