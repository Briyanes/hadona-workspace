/**
 * Playwright Test: Team Chat Page
 * 
 * Tests the chat page at https://workspace.hadona.id/chat
 * Captures: console errors, network failures, API responses, UI state
 * 
 * Usage: node scripts/playwright-chat-test.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://workspace.hadona.id';
const LOGIN_URL = `${BASE_URL}/login`;
const CHAT_URL = `${BASE_URL}/chat`;

const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@hadona.id';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '@Yogyakarta2026';

const consoleErrors = [];
const networkErrors = [];
const apiResponses = [];
const toastMessages = [];

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Team Chat Page Test');
  console.log('═══════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // ─── Capture console ───
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      consoleErrors.push(text);
      console.log(`  ❌ CONSOLE ERROR: ${text}`);
    } else if (type === 'warning') {
      console.log(`  ⚠️  CONSOLE WARN: ${text}`);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log(`  💥 PAGE ERROR: ${err.message}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('hadona') || url.includes('chat')) {
      networkErrors.push(`${req.failure()?.errorText} — ${url}`);
      console.log(`  🌐 NETWORK FAIL: ${req.failure()?.errorText} — ${url}`);
    }
  });

  // ─── Capture API responses for chat endpoints ───
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/chat/')) {
      const status = res.status();
      let body = '';
      try { body = await res.text(); } catch {}
      apiResponses.push({ url, status, body: body.slice(0, 500) });
      
      if (status >= 400) {
        console.log(`  🔴 API ${status}: ${url.split('/api/')[1]}`);
        console.log(`     → ${body.slice(0, 200)}`);
      } else {
        console.log(`  🟢 API ${status}: ${url.split('/api/')[1]}`);
      }
    }
  });

  // ─── Capture toasts ───
  await page.exposeFunction('captureToast', (text) => {
    toastMessages.push(text);
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

  try {
    // ═══ STEP 1: Login ═══
    console.log('\n📋 Step 1: Login...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
    }

    if (page.url().includes('/login')) {
      console.log('  ⚠️ Still on login page — credentials might be wrong');
      await page.screenshot({ path: 'scripts/screenshots/chat-test/login-failed.png' });
    } else {
      console.log('  ✅ Login successful');
    }

    // ═══ STEP 2: Navigate to Chat ═══
    console.log('\n📋 Step 2: Navigate to /chat...');
    await page.goto(CHAT_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scripts/screenshots/chat-test/01-chat-loaded.png' });

    // Check for error boundary
    const errorBoundaryVisible = await page.locator('text=Terjadi Kesalahan').isVisible().catch(() => false);
    const errorBoundaryAlt = await page.locator('text=Something went wrong').isVisible().catch(() => false);
    
    if (errorBoundaryVisible || errorBoundaryAlt) {
      console.log('  🔴 ERROR BOUNDARY TRIGGERED — page crashed!');
      
      // Get error details
      const errorText = await page.locator('body').textContent().catch(() => '');
      console.log(`  📋 Page content: ${errorText?.slice(0, 500)}`);
    } else {
      console.log('  ✅ No error boundary — page rendered');
    }

    // ═══ STEP 3: Check page structure ═══
    console.log('\n📋 Step 3: Check page elements...');

    // Check sidebar channels
    const channelButtons = await page.locator('button:has-text("#")').count();
    console.log(`  📋 Channel buttons found: ${channelButtons}`);

    // Check for loading text
    const loadingVisible = await page.locator('text=Memuat').isVisible().catch(() => false);
    console.log(`  📋 Loading indicator visible: ${loadingVisible}`);

    // Check for "Pilih channel" empty state
    const emptyStateVisible = await page.locator('text=Pilih channel').isVisible().catch(() => false);
    console.log(`  📋 Empty state visible: ${emptyStateVisible}`);

    // Check for "Belum ada pesan"
    const noMessagesVisible = await page.locator('text=Belum ada pesan').isVisible().catch(() => false);
    console.log(`  📋 "No messages" state visible: ${noMessagesVisible}`);

    // Check for input textarea
    const inputVisible = await page.locator('textarea').isVisible().catch(() => false);
    console.log(`  📋 Message input visible: ${inputVisible}`);

    // ═══ STEP 4: Try sending a message (if channel auto-selected) ═══
    console.log('\n📋 Step 4: Try sending a test message...');
    
    if (inputVisible) {
      await page.fill('textarea', 'Test message from Playwright 🤖');
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'scripts/screenshots/chat-test/02-message-typed.png' });

      // Click send button
      const sendBtn = page.locator('button:has(svg)').last();
      await sendBtn.click().catch(() => {});
      
      // Or press Enter
      await page.keyboard.press('Enter').catch(() => {});
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'scripts/screenshots/chat-test/03-after-send.png' });
      console.log('  ✅ Message send attempted');
    } else {
      console.log('  ⚠️ No input visible — channel may not be selected');
    }

    // ═══ STEP 5: Wait for realtime + final state ═══
    console.log('\n📋 Step 5: Wait for realtime events...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scripts/screenshots/chat-test/04-final-state.png' });

    // ═══ FINAL REPORT ═══
    console.log('\n═══════════════════════════════════════════════');
    console.log('  FINAL REPORT');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Console errors: ${consoleErrors.length}`);
    console.log(`  Network errors: ${networkErrors.length}`);
    console.log(`  API responses: ${apiResponses.length}`);
    console.log(`  Toast messages: ${toastMessages.length}`);

    if (consoleErrors.length > 0) {
      console.log('\n  🔴 CONSOLE ERRORS:');
      consoleErrors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
    }

    if (apiResponses.length > 0) {
      console.log('\n  📡 API RESPONSES:');
      apiResponses.forEach((r, i) => {
        console.log(`    ${i + 1}. [${r.status}] ${r.url.split('/api/')[1]}`);
        if (r.status >= 400) {
          console.log(`       Body: ${r.body}`);
        }
      });
    }

    if (toastMessages.length > 0) {
      console.log('\n  📢 TOAST MESSAGES:');
      toastMessages.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
    }

    // Diagnosis
    console.log('\n  📊 DIAGNOSIS:');
    const hasChatTableError = apiResponses.some(r => r.body.includes('relation') && r.body.includes('does not exist'));
    const hasAuthError = apiResponses.some(r => r.status === 401);
    const hasRlsError = apiResponses.some(r => r.body.includes('row-level') || r.body.includes('RLS'));
    
    if (hasChatTableError) {
      console.log('    🔴 Chat tables missing — migration-v72.sql NOT applied to database!');
    }
    if (hasAuthError) {
      console.log('    🔴 Auth error — session token missing or expired');
    }
    if (hasRlsError) {
      console.log('    🔴 RLS policy blocking access — check Supabase policies');
    }
    if (consoleErrors.length === 0 && apiResponses.every(r => r.status < 400)) {
      console.log('    ✅ No critical errors detected');
    }

    console.log('\n  Screenshots: scripts/screenshots/chat-test/');
    console.log('═══════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n💥 Test failed:', err.message);
    await page.screenshot({ path: 'scripts/screenshots/chat-test/error-state.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run().catch(console.error);