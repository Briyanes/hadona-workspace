import { chromium } from "playwright";
import fs from "fs";

const APP_URL = "https://workspace.hadona.id";
const SCREENSHOT_DIR = "scripts/screenshots/dashboard-check";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log("1. Navigating to login page...");
  await page.goto(`${APP_URL}/login`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login.png`, fullPage: true });

  console.log("2. Login page URL:", page.url());
  
  // Check if we're redirected to login
  const loginInput = await page.locator('input[type="email"], input[name="email"]').count();
  const passwordInput = await page.locator('input[type="password"], input[name="password"]').count();
  console.log(`   Login inputs found: email=${loginInput}, password=${passwordInput}`);

  // Try to login with test credentials
  console.log("3. Attempting login...");
  try {
    await page.fill('input[type="email"], input[name="email"]', "admin@hadona.id");
    await page.fill('input[type="password"], input[name="password"]', "hadona123");
    
    // Find and click submit button
    const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Masuk")').first();
    await submitBtn.click();
    
    console.log("   Waiting for redirect after login...");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-after-login.png`, fullPage: true });
    console.log("   Current URL:", page.url());
  } catch (e) {
    console.log("   Login attempt error:", e.message);
  }

  // If we're on dashboard, check for buttons
  console.log("4. Navigating to dashboard...");
  await page.goto(`${APP_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-dashboard.png`, fullPage: true });
  console.log("   Dashboard URL:", page.url());

  // Search for all buttons and links
  console.log("\n5. Searching for buttons/links...");
  
  const allButtons = await page.locator("button, a").allTextContents();
  console.log("   All buttons/links text:");
  allButtons.forEach((t, i) => {
    const trimmed = t.trim();
    if (trimmed) console.log(`     [${i}] "${trimmed.substring(0, 80)}"`);
  });

  // Specifically look for Import Sheet
  console.log('\n6. Looking for "Import Sheet"...');
  const importBtn = await page.locator('button:has-text("Import"), button:has-text("import")').count();
  console.log(`   Import buttons found: ${importBtn}`);
  
  const importText = await page.locator('text=Import Sheet').count();
  console.log(`   "Import Sheet" text occurrences: ${importText}`);

  // Look for Report button
  console.log('\n7. Looking for "Report"...');
  const reportText = await page.locator('text=Report').count();
  console.log(`   "Report" text occurrences: ${reportText}`);

  // Check the quick actions area specifically
  console.log("\n8. Checking quick actions area...");
  const quickActionBtns = await page.locator(".btn-primary, [class*='rounded-md border']").allTextContents();
  console.log("   Quick action buttons:", quickActionBtns.map(t => t.trim()).filter(Boolean));

  // Check if loading state
  console.log("\n9. Checking page state...");
  const skeletonCount = await page.locator('.skeleton, [class*="animate-pulse"]').count();
  console.log(`   Skeleton/loading elements: ${skeletonCount}`);

  // Get page title and h1
  const h1Text = await page.locator("h1").first().textContent().catch(() => "N/A");
  console.log(`   H1 text: "${h1Text?.trim()}"`);

  // Mobile view
  console.log("\n10. Testing mobile viewport...");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-dashboard-mobile.png`, fullPage: true });
  
  const mobileButtons = await page.locator("button, a").allTextContents();
  const mobileImport = mobileButtons.filter(t => t.toLowerCase().includes("import"));
  console.log("   Mobile buttons with 'import':", mobileImport);

  await browser.close();
  console.log("\n✅ Done! Screenshots saved to", SCREENSHOT_DIR);
}

main().catch(e => {
  console.error("❌ Error:", e);
  process.exit(1);
});