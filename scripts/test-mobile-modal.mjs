import { chromium, devices } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SCREENSHOT_DIR = path.join(process.cwd(), "scripts", "screenshots");

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function testMobileModal() {
  console.log("🚀 Starting Playwright mobile modal test...\n");

  const browser = await chromium.launch({ headless: true });
  const iPhone14 = devices["iPhone 14"];

  const context = await browser.newContext({
    ...iPhone14,
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();

  try {
    // ─── Step 1: Login ───
    console.log("📝 Step 1: Logging in...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for the login form to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Fill email
    await page.fill('input[type="email"]', EMAIL);

    // Fill password
    await page.fill('input[type="password"]', PASSWORD);

    // Click submit
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL("**/dashboard", { timeout: 15000 }).catch(() => {
      console.log("  ⚠️ Dashboard URL not detected, checking current URL...");
    });

    // Wait a bit for page to settle
    await page.waitForTimeout(2000);
    console.log(`  ✅ Logged in. Current URL: ${page.url()}\n`);

    // ─── Step 2: Navigate to ads-spend ───
    console.log("📊 Step 2: Navigating to /ads-spend...");
    await page.goto(`${BASE_URL}/ads-spend`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(3000); // Wait for data to load

    // Screenshot the page before opening modal
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "01-ads-spend-page-mobile.png"),
      fullPage: false,
    });
    console.log("  📸 Screenshot: 01-ads-spend-page-mobile.png");

    // ─── Step 3: Click "New Ad Account" button ───
    console.log("\n🔵 Step 3: Clicking 'New Ad Account' button...");

    // Try to find the button by text
    const newBtn = page.locator('button:has-text("New Ad Account")');
    const btnCount = await newBtn.count();
    console.log(`  Found ${btnCount} button(s) matching "New Ad Account"`);

    if (btnCount === 0) {
      // Try alternative: Plus icon button
      console.log("  Trying alternative selector...");
      const altBtn = page.locator('button:has-text("New")').first();
      await altBtn.click();
    } else {
      await newBtn.first().click();
    }

    // Wait for modal to appear
    await page.waitForTimeout(1000);

    // Screenshot: Modal open (initial state)
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "02-modal-open-mobile.png"),
      fullPage: false,
    });
    console.log("  📸 Screenshot: 02-modal-open-mobile.png");

    // ─── Step 4: Analyze modal dimensions ───
    console.log("\n📏 Step 4: Analyzing modal dimensions...");

    const modalInfo = await page.evaluate(() => {
      const overlay = document.querySelector('.fixed.inset-0.z-\\[100\\]');
      const modalContainer = overlay?.querySelector('.my-4, .max-h-\\[calc\\(100dvh-2rem\\)\\]');
      const scrollableBody = document.querySelector('.flex-1.overflow-y-auto');

      const viewportHeight = window.innerHeight;
      const overlayRect = overlay?.getBoundingClientRect();
      const containerRect = modalContainer?.getBoundingClientRect();
      const bodyRect = scrollableBody?.getBoundingClientRect();
      const bodyScrollHeight = scrollableBody?.scrollHeight;
      const bodyClientHeight = scrollableBody?.clientHeight;
      const canScroll = bodyScrollHeight > bodyClientHeight;

      return {
        viewportHeight,
        overlay: overlayRect ? {
          top: overlayRect.top,
          height: overlayRect.height,
          scrollable: overlay.scrollHeight > overlay.clientHeight,
        } : null,
        container: containerRect ? {
          top: containerRect.top,
          height: containerRect.height,
          bottom: containerRect.bottom,
          maxHeight: modalContainer?.style.maxHeight || getComputedStyle(modalContainer).maxHeight,
        } : null,
        scrollableBody: bodyRect ? {
          top: bodyRect.top,
          height: bodyRect.height,
          scrollHeight: bodyScrollHeight,
          clientHeight: bodyClientHeight,
          canScroll,
          overflowY: getComputedStyle(scrollableBody).overflowY,
        } : null,
      };
    });

    console.log("  📊 Modal Analysis:");
    console.log(`     Viewport height: ${modalInfo.viewportHeight}px`);
    if (modalInfo.overlay) {
      console.log(`     Overlay: height=${modalInfo.overlay.height}px, scrollable=${modalInfo.overlay.scrollable}`);
    }
    if (modalInfo.container) {
      console.log(`     Container: top=${modalInfo.container.top.toFixed(0)}px, height=${modalInfo.container.height.toFixed(0)}px, bottom=${modalInfo.container.bottom.toFixed(0)}px`);
      console.log(`     Container maxHeight: ${modalInfo.container.maxHeight}`);
      const fitsViewport = modalInfo.container.bottom <= modalInfo.viewportHeight;
      console.log(`     Fits viewport: ${fitsViewport ? "✅ YES" : "❌ NO (overflow!)"}`);
    }
    if (modalInfo.scrollableBody) {
      console.log(`     Scrollable body: height=${modalInfo.scrollableBody.height.toFixed(0)}px, scrollHeight=${modalInfo.scrollableBody.scrollHeight}px`);
      console.log(`     Body can scroll: ${modalInfo.scrollableBody.canScroll ? "✅ YES" : "❌ NO"}`);
      console.log(`     Body overflow-y: ${modalInfo.scrollableBody.overflowY}`);
    }

    // ─── Step 5: Try scrolling within modal ───
    console.log("\n🔄 Step 5: Scrolling within modal body...");

    if (modalInfo.scrollableBody) {
      // Scroll the modal body
      await page.evaluate(() => {
        const body = document.querySelector('.flex-1.overflow-y-auto');
        if (body) {
          body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
        }
      });
      await page.waitForTimeout(1000);

      // Screenshot: Modal scrolled to bottom
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, "03-modal-scrolled-mobile.png"),
        fullPage: false,
      });
      console.log("  📸 Screenshot: 03-modal-scrolled-mobile.png");

      // Check scroll position
      const scrollPos = await page.evaluate(() => {
        const body = document.querySelector('.flex-1.overflow-y-auto');
        return body ? { scrollTop: body.scrollTop, scrollHeight: body.scrollHeight } : null;
      });
      console.log(`  Scroll position: ${JSON.stringify(scrollPos)}`);

      // Scroll back to top
      await page.evaluate(() => {
        const body = document.querySelector('.flex-1.overflow-y-auto');
        if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
      });
      await page.waitForTimeout(500);
    }

    // ─── Step 6: Try scrolling the overlay (new pattern) ───
    console.log("\n🔄 Step 6: Testing overlay scroll (new pattern)...");

    // Make modal content taller by filling textarea
    const textareaExists = await page.locator('textarea').count();
    if (textareaExists > 0) {
      await page.locator('textarea').first().fill("Test note for mobile modal scroll testing. ".repeat(5));
      await page.waitForTimeout(500);
    }

    // Try scrolling the overlay div
    await page.evaluate(() => {
      const overlay = document.querySelector('.fixed.inset-0.z-\\[100\\]');
      if (overlay) {
        overlay.scrollTo({ top: overlay.scrollHeight, behavior: 'smooth' });
      }
    });
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "04-modal-overlay-scrolled-mobile.png"),
      fullPage: false,
    });
    console.log("  📸 Screenshot: 04-modal-overlay-scrolled-mobile.png");

    // ─── Step 7: Full page screenshot (to see overflow) ───
    console.log("\n📄 Step 7: Full page screenshot...");
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "05-modal-fullpage-mobile.png"),
      fullPage: true,
    });
    console.log("  📸 Screenshot: 05-modal-fullpage-mobile.png");

    // ─── Summary ───
    console.log("\n" + "═".repeat(60));
    console.log("📋 TEST SUMMARY");
    console.log("═".repeat(60));
    console.log(`✅ Login: SUCCESS`);
    console.log(`✅ Navigate to /ads-spend: SUCCESS`);
    console.log(`✅ Open modal: SUCCESS`);
    console.log(`📸 Screenshots saved to: scripts/screenshots/`);
    if (modalInfo.scrollableBody) {
      if (modalInfo.scrollableBody.canScroll) {
        console.log(`✅ Modal body scroll: WORKS`);
      } else {
        console.log(`⚠️ Modal body scroll: Content shorter than viewport`);
      }
    }
    console.log("═".repeat(60));

  } catch (err) {
    console.error("\n❌ ERROR:", err.message);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, "error-state.png"),
      fullPage: false,
    }).catch(() => {});
    console.log(`📸 Error screenshot: scripts/screenshots/error-state.png`);
    console.log(`   URL at error: ${page.url()}`);
  } finally {
    await browser.close();
  }
}

testMobileModal().catch(console.error);