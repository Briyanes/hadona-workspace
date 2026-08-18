/**
 * Quick check: Ambil status task TPDOC langsung dari API /api/monthly-reports
 * (join task:tasks(id,title,status) — data presisi dari database)
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    // Login
    console.log("🔐 Logging in...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(2000);
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    if (await emailInput.count()) await emailInput.fill(EMAIL);
    const pwdInput = page.locator('input[type="password"], input[name="password"]');
    if (await pwdInput.count()) await pwdInput.fill(PASSWORD);
    const submitBtn = page.locator('button[type="submit"]');
    if (await submitBtn.count()) await submitBtn.first().click();
    await sleep(4000);
    console.log("✅ URL:", page.url());

    // Fetch monthly reports via authenticated session
    console.log("\n📡 Fetching /api/monthly-reports...");
    const reports = await page.evaluate(async () => {
      const res = await fetch("/api/monthly-reports", { credentials: "include" });
      return res.json();
    });

    if (!Array.isArray(reports)) {
      console.log("⚠️ Response:", JSON.stringify(reports).slice(0, 500));
      return;
    }

    console.log(`📦 Total monthly reports: ${reports.length}\n`);
    for (const r of reports) {
      const clientName = r.client?.name || "(no client)";
      const taskTitle = r.task?.title || "(no task)";
      const taskStatus = r.task?.status || "(no status)";
      const isTpdoc =
        taskTitle.toLowerCase().includes("tpdoc") || clientName.toLowerCase().includes("tpdoc");
      const marker = isTpdoc ? " ⭐ <-- TPDOC" : "";
      console.log(
        `- [${r.period_month}/${r.period_year}] client=${clientName} | task="${taskTitle}" | TASK STATUS=${taskStatus} | report_status=${r.status}${marker}`
      );
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await browser.close();
  }
}

main();