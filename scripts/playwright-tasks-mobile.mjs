/**
 * Playwright Mobile Test: Tasks Page
 *
 * Tests https://workspace.hadona.id/tasks in mobile viewport (iPhone 14 Pro)
 * Captures: layout overflow, sidebar mobile, modal scroll, touch targets, console errors
 *
 * Usage: node scripts/playwright-tasks-mobile.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://workspace.hadona.id';
const LOGIN_URL = `${BASE_URL}/login`;
const TASKS_URL = `${BASE_URL}/tasks`;

const TEST_EMAIL = process.env.TEST_EMAIL;
const TEST_PASSWORD = process.env.TEST_PASSWORD;

const SCREENSHOT_DIR = 'scripts/screenshots/tasks-mobile';

const consoleErrors = [];
const networkErrors = [];

async function run() {
  // Ensure screenshot directory exists
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('═══════════════════════════════════════════════');
  console.log('  Tasks Page — Mobile View Test');
  console.log('  Viewport: 390×844 (iPhone 14 Pro)');
  console.log('═══════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/537.36',
    bypassCSP: true,
    extraHTTPHeaders: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  });

  // Disable cache
  await context.route('**/*', (route) => {
    const headers = route.request().headers();
    headers['Cache-Control'] = 'no-cache';
    route.continue({ headers });
  });

  const page = await context.newPage();

  // ─── Capture console errors ───
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      consoleErrors.push(text);
      console.log(`  ❌ CONSOLE ERROR: ${text}`);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.log(`  💥 PAGE ERROR: ${err.message}`);
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('supabase') || url.includes('hadona') || url.includes('tasks')) {
      networkErrors.push(`${req.failure()?.errorText} — ${url}`);
      console.log(`  🌐 NETWORK FAIL: ${req.failure()?.errorText} — ${url}`);
    }
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
      await page.screenshot({ path: `${SCREENSHOT_DIR}/login-failed.png` });
    } else {
      console.log('  ✅ Login successful');
    }

    // ═══ STEP 2: Navigate to Tasks ═══
    console.log('\n📋 Step 2: Navigate to /tasks...');
    await page.goto(TASKS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-tasks-page-mobile.png`, fullPage: true });
    console.log('  📸 Screenshot: 01-tasks-page-mobile.png');

    // ─── ANALYSIS 1: Page overflow check ───
    console.log('\n📋 Step 3: Analyze layout overflow...');
    const overflowData = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const bodyScrollWidth = body.scrollWidth;
      const bodyClientWidth = body.clientWidth;
      const hasHorizontalScroll = bodyScrollWidth > bodyClientWidth;

      // Find elements wider than viewport
      const overflowing = [];
      document.querySelectorAll('*').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 2 || rect.width > window.innerWidth + 2) {
          overflowing.push({
            tag: el.tagName,
            id: el.id,
            class: el.className?.toString().slice(0, 60),
            width: Math.round(rect.width),
            right: Math.round(rect.right),
          });
        }
      });

      return {
        viewportWidth: window.innerWidth,
        bodyScrollWidth,
        bodyClientWidth,
        hasHorizontalScroll,
        overflowingCount: overflowing.length,
        topOverflowing: overflowing.slice(0, 5),
      };
    });

    console.log(`  📐 Viewport width: ${overflowData.viewportWidth}px`);
    console.log(`  📐 Body scroll width: ${overflowData.bodyScrollWidth}px`);
    console.log(
      `  ${overflowData.hasHorizontalScroll ? '🔴' : '✅'} Horizontal scroll: ${overflowData.hasHorizontalScroll ? 'YES — BUG!' : 'No'}`
    );
    if (overflowData.overflowingCount > 0) {
      console.log(`  ⚠️  Overflowing elements: ${overflowData.overflowingCount}`);
      overflowData.topOverflowing.forEach((el, i) => {
        console.log(`    ${i + 1}. <${el.tag}> #${el.id} .${el.class} — width: ${el.width}px, right: ${el.right}px`);
      });
    }

    // ─── ANALYSIS 2: Sidebar mobile ───
    console.log('\n📋 Step 4: Test mobile sidebar...');
    const hamburger = await page
      .locator('button:has(svg)', { hasText: '' })
      .first()
      .isVisible()
      .catch(() => false);

    // Try clicking hamburger menu
    const sidebarButton = page.locator('button').filter({ hasNot: page.locator('input') }).first();
    await sidebarButton.click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-sidebar-open-mobile.png` });
    console.log('  📸 Screenshot: 02-sidebar-open-mobile.png');

    // Close sidebar
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);

    // Click backdrop to close
    await page
      .locator('div.fixed.inset-0')
      .click()
      .catch(() => {});
    await page.waitForTimeout(500);

    // ─── ANALYSIS 3: Task list / table ───
    console.log('\n📋 Step 5: Analyze task list rendering...');
    const taskListData = await page.evaluate(() => {
      // Check if table exists
      const table = document.querySelector('table');
      const tableWidth = table ? table.scrollWidth : 0;
      const viewportWidth = window.innerWidth;

      // Check for horizontal scrollable containers
      const scrollables = [];
      document.querySelectorAll('[class*="overflow"], table').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth) {
          scrollables.push({
            tag: el.tagName,
            class: el.className?.toString().slice(0, 60),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          });
        }
      });

      // Count task rows/cards
      const tableRows = document.querySelectorAll('tbody tr').length;
      const taskCards = document.querySelectorAll('[class*="card"], [class*="task-item"]').length;

      return {
        hasTable: !!table,
        tableWidth,
        viewportWidth,
        tableOverflow: tableWidth > viewportWidth,
        tableRows,
        taskCards,
        scrollables: scrollables.slice(0, 5),
      };
    });

    console.log(`  📊 Has table: ${taskListData.hasTable}`);
    if (taskListData.hasTable) {
      console.log(`  📐 Table width: ${taskListData.tableWidth}px (viewport: ${taskListData.viewportWidth}px)`);
      console.log(
        `  ${taskListData.tableOverflow ? '🔴' : '✅'} Table overflow: ${taskListData.tableOverflow ? 'YES — needs horizontal scroll' : 'No'}`
      );
      console.log(`  📊 Table rows: ${taskListData.tableRows}`);
    }
    console.log(`  📊 Task cards: ${taskListData.taskCards}`);

    if (taskListData.scrollables.length > 0) {
      console.log(`  ⚠️  Scrollable containers found: ${taskListData.scrollables.length}`);
      taskListData.scrollables.forEach((s, i) => {
        console.log(`    ${i + 1}. <${s.tag}> scrollWidth: ${s.scrollWidth}px / clientWidth: ${s.clientWidth}px`);
      });
    }

    // ─── ANALYSIS 4: Click first task to open detail modal ───
    console.log('\n📋 Step 6: Open task detail modal...');

    // Re-navigate to tasks
    await page.goto(TASKS_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Try clicking first task row
    const firstRow = page.locator('tbody tr').first();
    const rowVisible = await firstRow.isVisible().catch(() => false);

    if (rowVisible) {
      await firstRow.click().catch(() => {});
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/03-task-detail-modal.png`, fullPage: true });
      console.log('  📸 Screenshot: 03-task-detail-modal.png');

      // Check modal scroll
      const modalData = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]') || document.querySelector('.fixed.inset-0.z-50');
        if (!modal) return { modalFound: false };

        const rect = modal.getBoundingClientRect();
        const modalContent = modal.querySelector('[class*="overflow-y"], [class*="max-h"]');
        const contentHeight = modalContent ? modalContent.scrollHeight : 0;
        const contentClientHeight = modalContent ? modalContent.clientHeight : 0;

        // Check if close button is visible (not cut off)
        const closeBtn = modal.querySelector('button[aria-label], button:last-child');
        const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;

        return {
          modalFound: true,
          modalHeight: Math.round(rect.height),
          viewportHeight: window.innerHeight,
          contentHeight,
          contentClientHeight,
          needsScroll: contentHeight > contentClientHeight,
          closeBtnVisible: closeRect ? closeRect.top >= 0 && closeRect.bottom <= window.innerHeight : null,
          closeBtnTop: closeRect ? Math.round(closeRect.top) : null,
        };
      });

      console.log(`  ${modalData.modalFound ? '✅' : '🔴'} Modal found: ${modalData.modalFound}`);
      if (modalData.modalFound) {
        console.log(`  📐 Modal height: ${modalData.modalHeight}px (viewport: ${modalData.viewportHeight}px)`);
        console.log(`  📐 Content height: ${modalData.contentHeight}px / visible: ${modalData.contentClientHeight}px`);
        console.log(
          `  ${modalData.needsScroll ? '⚠️ ' : '✅ '}Needs internal scroll: ${modalData.needsScroll}`
        );
        if (modalData.closeBtnVisible !== null) {
          console.log(
            `  ${modalData.closeBtnVisible ? '✅' : '🔴'} Close button visible: ${modalData.closeBtnVisible ? 'Yes' : 'NO — CUT OFF!'}`
          );
        }
      }

      // Scroll modal down
      console.log('\n📋 Step 7: Scroll modal content...');
      await page.evaluate(() => {
        const scrollable = document.querySelector('[class*="overflow-y-auto"]') || document.querySelector('[class*="max-h-"]');
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
      });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/04-modal-scrolled.png` });
      console.log('  📸 Screenshot: 04-modal-scrolled.png');

      // Close modal
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      console.log('  ⚠️ No task rows found — skipping modal test');
    }

    // ─── ANALYSIS 5: Create task button ───
    console.log('\n📋 Step 8: Test "New Task" button...');
    const newTaskBtn = page.locator('button:has-text("New Task"), button:has-text("Tambah"), button:has-text("Create"), a:has-text("New")');
    const btnVisible = await newTaskBtn.first().isVisible().catch(() => false);

    if (btnVisible) {
      await newTaskBtn.first().click().catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/05-create-task-modal.png`, fullPage: true });
      console.log('  📸 Screenshot: 05-create-task-modal.png');

      // Check create modal scroll
      const createModalData = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]') || document.querySelector('.fixed.inset-0.z-50');
        if (!modal) return { modalFound: false };

        const rect = modal.getBoundingClientRect();
        return {
          modalFound: true,
          modalHeight: Math.round(rect.height),
          viewportHeight: window.innerHeight,
          fitsInViewport: rect.height <= window.innerHeight,
        };
      });

      console.log(`  📐 Create modal height: ${createModalData.modalHeight}px (viewport: ${createModalData.viewportHeight}px)`);
      console.log(
        `  ${createModalData.fitsInViewport ? '✅' : '🔴'} Fits in viewport: ${createModalData.fitsInViewport ? 'Yes' : 'NO — OVERFLOW!'}`
      );

      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    } else {
      console.log('  ⚠️ No "New Task" button found');
    }

    // ─── ANALYSIS 6: Touch target sizes ───
    console.log('\n📋 Step 9: Check touch target sizes...');
    const touchData = await page.evaluate(() => {
      const minSize = 44; // Apple HIG minimum
      const smallTargets = [];
      document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          if (rect.width < minSize || rect.height < minSize) {
            smallTargets.push({
              tag: el.tagName,
              text: el.textContent?.trim().slice(0, 30),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }
      });
      return { minSize, smallCount: smallTargets.length, topSmall: smallTargets.slice(0, 5) };
    });

    if (touchData.smallCount > 0) {
      console.log(`  ⚠️  Touch targets below ${touchData.minSize}px: ${touchData.smallCount}`);
      touchData.topSmall.forEach((t, i) => {
        console.log(`    ${i + 1}. <${t.tag}> "${t.text}" — ${t.width}×${t.height}px`);
      });
    } else {
      console.log(`  ✅ All touch targets ≥ ${touchData.minSize}px`);
    }

    // ═══ FINAL REPORT ═══
    console.log('\n═══════════════════════════════════════════════');
    console.log('  FINAL REPORT');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Console errors: ${consoleErrors.length}`);
    console.log(`  Network errors: ${networkErrors.length}`);
    console.log(`  Horizontal overflow: ${overflowData.hasHorizontalScroll ? '🔴 YES' : '✅ NO'}`);
    console.log(`  Table overflow: ${taskListData.tableOverflow ? '🔴 YES' : '✅ NO'}`);
    console.log(`  Small touch targets: ${touchData.smallCount}`);

    if (consoleErrors.length > 0) {
      console.log('\n  🔴 CONSOLE ERRORS:');
      consoleErrors.forEach((e, i) => console.log(`    ${i + 1}. ${e}`));
    }

    console.log(`\n  📸 Screenshots saved to: ${SCREENSHOT_DIR}/`);
    console.log('═══════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n💥 Test failed:', err.message);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/error-state.png` }).catch(() => {});
  } finally {
    await browser.close();
  }
}

run().catch(console.error);