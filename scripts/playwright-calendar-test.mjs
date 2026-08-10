/**
 * Playwright Test: Calendar Event Creation
 * 
 * Tests the full flow of creating a calendar event at
 * https://workspace.hadona.id/calendar
 * 
 * Captures: console errors, network failures, toast messages
 * 
 * Usage: node scripts/playwright-calendar-test.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://workspace.hadona.id';
const LOGIN_URL = `${BASE_URL}/login`;
const CALENDAR_URL = `${BASE_URL}/calendar`;

// Credentials provided by user
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@hadona.id';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '@Yogyakarta2026';

const consoleErrors = [];
const networkErrors = [];
const toastMessages = [];

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Calendar Event Creation Test');
  console.log('═══════════════════════════════════════════════\n');

  if (!TEST_PASSWORD) {
    console.error('❌ Set TEST_PASSWORD env var first!');
    console.error('   Usage: TEST_PASSWORD=xxx node scripts/playwright-calendar-test.mjs');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // ─── Capture console messages ───
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      consoleErrors.push(text);
      console.log(`  ❌ CONSOLE ERROR: ${text}`);
    } else if (text.includes('[Calendar]')) {
      console.log(`  🔍 CONSOLE LOG: ${text}`);
    }
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message);
    console.log(`  💥 PAGE ERROR: ${err.message}`);
  });

  page.on('requestfailed', req => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('hadona')) {
      networkErrors.push(`${req.failure()?.errorText} — ${url}`);
      console.log(`  🌐 NETWORK FAIL: ${req.failure()?.errorText} — ${url}`);
    }
  });

  // ─── Capture toast notifications ───
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
    console.log('\n📋 Step 1: Login to workspace...');
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check if already logged in
    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);
    }

    if (page.url().includes('/login')) {
      console.log('  ⚠️ Still on login page — might need to check credentials');
      await page.screenshot({ path: 'scripts/screenshots/calendar-test/login-failed.png' });
    } else {
      console.log('  ✅ Login successful');
    }

    // ═══ STEP 2: Go to Calendar ═══
    console.log('\n📋 Step 2: Navigate to Calendar...');
    await page.goto(CALENDAR_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'scripts/screenshots/calendar-test/01-calendar-loaded.png' });
    console.log('  ✅ Calendar page loaded');

    // ═══ STEP 3: Click "New Event" button ═══
    console.log('\n📋 Step 3: Click "New Event" button...');
    const newEventBtn = page.locator('button:has-text("New Event"), button:has-text("Event")').last();
    await newEventBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'scripts/screenshots/calendar-test/02-modal-open.png' });
    console.log('  ✅ Event modal opened');

    // ═══ STEP 4: Fill form ═══
    console.log('\n📋 Step 4: Fill event form...');

    // Title
    await page.fill('input[placeholder*="Monthly Meeting"], input[required]:first-of-type', 'Test Event - Playwright Auto');
    console.log('  ✅ Title filled');

    // Event Type
    await page.selectOption('select:first-of-type', 'client_meeting');
    console.log('  ✅ Event type selected');

    // Start datetime (tomorrow 10:00)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const startDateStr = tomorrow.toISOString().slice(0, 16);
    await page.fill('input[type="datetime-local"]:first-of-type', startDateStr);
    console.log('  ✅ Start datetime filled');

    // End datetime (tomorrow 11:00)
    const endDate = new Date(tomorrow);
    endDate.setHours(11, 0, 0, 0);
    const endDateStr = endDate.toISOString().slice(0, 16);
    const endInputs = await page.locator('input[type="datetime-local"]').all();
    if (endInputs.length > 1) {
      await endInputs[1].fill(endDateStr);
      console.log('  ✅ End datetime filled');
    }

    // Location
    await page.fill('input[placeholder*="Kantor"]', 'Test Location');
    console.log('  ✅ Location filled');

    await page.screenshot({ path: 'scripts/screenshots/calendar-test/03-form-filled.png' });

    // ═══ STEP 5: Submit WITHOUT task assignment first ═══
    console.log('\n📋 Step 5: Submit event (no task assignment)...');
    
    // Uncheck "create task for PM" if checked
    const taskCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: /task/i });
    const taskCheckboxContainer = page.locator('label:has-text("Assign task") input[type="checkbox"]');
    if (await taskCheckboxContainer.count() > 0) {
      await taskCheckboxContainer.uncheck({ force: true }).catch(() => {});
    }

    // Click submit
    const submitBtn = page.locator('button[type="submit"]:has-text("Buat Event")');
    await submitBtn.click();
    console.log('  ⏳ Waiting for response...');

    // Wait for either success or error
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'scripts/screenshots/calendar-test/04-after-submit.png' });

    // Check if modal closed (success indicator)
    const modalStillOpen = await page.locator('text=Buat Event / Meeting').isVisible().catch(() => false);
    if (!modalStillOpen) {
      console.log('  ✅ Modal closed — event likely created successfully!');
    } else {
      console.log('  ❌ Modal still open — event creation may have failed');
    }

    // ═══ STEP 6: Check console for errors ═══
    console.log('\n📋 Step 6: Analyzing results...');
    console.log(`  Console errors: ${consoleErrors.length}`);
    console.log(`  Network errors: ${networkErrors.length}`);
    console.log(`  Toast messages: ${toastMessages.length}`);

    if (consoleErrors.length > 0) {
      console.log('\n  📋 Console Errors:');
      consoleErrors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
    }

    if (toastMessages.length > 0) {
      console.log('\n  📋 Toast Messages:');
      toastMessages.forEach((t, i) => console.log(`    ${i + 1}. ${t}`));
    }

    // ═══ STEP 7: Test WITH task assignment ═══
    console.log('\n📋 Step 7: Test event WITH task assignment...');

    // Open modal again
    await page.waitForTimeout(1000);
    const newEventBtn2 = page.locator('button:has-text("New Event"), button:has-text("Event")').last();
    if (await newEventBtn2.isVisible().catch(() => false)) {
      await newEventBtn2.click();
      await page.waitForTimeout(1000);

      // Fill minimal form
      await page.fill('input[placeholder*="Monthly Meeting"], input[required]:first-of-type', 'Test Event With Task - Playwright');
      await page.fill('input[type="datetime-local"]:first-of-type', startDateStr);

      // Check "create task for PM"
      const taskCheckbox2 = page.locator('label:has-text("Assign task") input[type="checkbox"]');
      if (await taskCheckbox2.count() > 0) {
        await taskCheckbox2.check({ force: true });
        console.log('  ✅ Task checkbox checked');
        await page.waitForTimeout(500);

        // Check if team members dropdown has options
        const pmSelect = page.locator('select:has(option:has-text("Pilih anggota"))');
        if (await pmSelect.count() > 0) {
          const options = await pmSelect.locator('option').allTextContents();
          console.log(`  📋 Team members dropdown has ${options.length} options: ${options.join(', ')}`);
          
          if (options.length > 1) {
            await pmSelect.selectOption({ index: 1 });
            console.log('  ✅ Team member selected');
          } else {
            console.log('  ⚠️ No team members in dropdown!');
          }
        }
      }

      await page.screenshot({ path: 'scripts/screenshots/calendar-test/05-with-task.png' });

      // Submit
      const submitBtn2 = page.locator('button[type="submit"]:has-text("Buat Event")');
      await submitBtn2.click();
      await page.waitForTimeout(8000);
      await page.screenshot({ path: 'scripts/screenshots/calendar-test/06-after-task-submit.png' });
    }

    // ═══ FINAL REPORT ═══
    console.log('\n═══════════════════════════════════════════════');
    console.log('  TEST COMPLETE - Final Report');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Total console errors: ${consoleErrors.length}`);
    console.log(`  Total network errors: ${networkErrors.length}`);
    console.log(`  Total toast messages: ${toastMessages.length}`);

    // Collect all Calendar-specific errors
    const calendarErrors = consoleErrors.filter(e =>
      e.includes('[Calendar]') || e.includes('calendar_events') || e.includes('task_assignees')
    );
    if (calendarErrors.length > 0) {
      console.log('\n  🔴 CALENDAR-SPECIFIC ERRORS:');
      calendarErrors.forEach(e => console.log(`    → ${e}`));
    } else {
      console.log('\n  ✅ No calendar-specific errors detected');
    }

    // Print all toast messages
    if (toastMessages.length > 0) {
      console.log('\n  📢 ALL TOAST MESSAGES:');
      toastMessages.forEach(t => console.log(`    → ${t}`));
    }

    console.log('\n  Screenshots saved to: scripts/screenshots/calendar-test/');
    console.log('═══════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n💥 Test failed with error:', err.message);
    await page.screenshot({ path: 'scripts/screenshots/calendar-test/error-state.png' }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run().catch(console.error);