if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
  console.error("Set TEST_EMAIL and TEST_PASSWORD env vars first!");
  process.exit(1);
}

import { chromium } from "playwright";
import fs from "fs";

const APP_URL = "https://workspace.hadona.id";
const SUPABASE_URL = SUPABASE_URL_ENV;
const SUPABASE_URL_ENV = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL_ENV || !SERVICE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first!");
  process.exit(1);
}
const SCREENSHOT_DIR = "scripts/screenshots/dashboard-check";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function generateAccessToken(userId) {
  // Generate a magic link for the user, then extract the token
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "magiclink",
      email: process.env.TEST_EMAIL,
    }),
  });
  
  const data = await res.json();
  console.log("Generate link status:", res.status);
  
  if (data.properties?.hashed_token) {
    // Verify the magic link to get session
    const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY,
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "magiclink",
        token: data.properties.hashed_token,
        redirect_to: APP_URL,
      }),
    });
    
    const verifyData = await verifyRes.json();
    console.log("Verify status:", verifyRes.status);
    return verifyData;
  }
  
  return null;
}

async function main() {
  console.log("1. Generating auth session...");
  const session = await generateAccessToken("1b075abf-3479-48ac-89af-3b062a455755");
  
  if (!session?.access_token) {
    console.log("   ❌ Failed to generate session");
    console.log("   Response:", JSON.stringify(session, null, 2).substring(0, 500));
    return;
  }
  
  console.log("   ✅ Got access token");
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // Go to the site first to set up the domain
  console.log("2. Loading site to set cookies...");
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  
  // Set Supabase session in localStorage
  console.log("3. Injecting Supabase session...");
  const sessionData = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    token_type: session.token_type,
    user: session.user,
  };
  
  await page.evaluate((session) => {
    const sbUrl = "rsxqjjcuixdsmijhgdyl";
    // Try different possible localStorage key formats
    const keys = [
      `sb-${sbUrl}-auth-token`,
      `sb:session`,
      `supabase.auth.token`,
    ];
    keys.forEach(k => {
      localStorage.setItem(k, JSON.stringify(session));
      // Also try the newer format
      localStorage.setItem(k, JSON.stringify({
        currentSession: session,
        expiresAt: session.expires_at,
      }));
    });
  }, sessionData);

  // Navigate to dashboard
  console.log("4. Navigating to dashboard...");
  await page.goto(`${APP_URL}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-dashboard-injected.png`, fullPage: true });
  console.log("   Current URL:", page.url());
  
  // Check for buttons
  console.log("\n5. Searching for Import Sheet button...");
  const importBtn = await page.locator('button:has-text("Import")').count();
  console.log(`   Import buttons: ${importBtn}`);
  
  const allButtons = await page.locator("button, a").allTextContents();
  console.log("   All buttons/links:");
  allButtons.forEach((t, i) => {
    const trimmed = t.trim();
    if (trimmed && trimmed.length < 80) console.log(`     [${i}] "${trimmed}"`);
  });

  // Check h1
  const h1Text = await page.locator("h1").first().textContent().catch(() => "N/A");
  console.log(`   H1: "${h1Text?.trim()}"`);
  
  // Try clicking Import Sheet
  if (importBtn > 0) {
    console.log("\n6. Clicking Import Sheet...");
    await page.locator('button:has-text("Import Sheet")').click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-import-modal.png`, fullPage: true });
    
    // Check modal content
    const modalText = await page.locator('[role="dialog"], .modal, [class*="modal"]').first().textContent().catch(() => "");
    console.log("   Modal content (first 300 chars):", modalText?.trim().substring(0, 300));
  }

  await browser.close();
  console.log("\n✅ Done!");
}

main().catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});