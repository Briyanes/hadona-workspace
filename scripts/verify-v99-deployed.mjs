/**
 * Verifikasi bundle production mengandung fix v99 — via Playwright.
 * Pendekatan: pakai storage state sesi QA → buka /tasks → grep marker di chunk.
 *
 * Marker unik dari commit de192b8 (fix drag-drop task board):
 * - "Kartu dikembalikan"  (drag handler rollback optimistic update)
 * - "sisanya diblokir izin" (bulk status handler partial permission)
 * - "move_task_secure"     (RPC v99 untuk drag antar-kolom)
 */
import { chromium } from "playwright";
import { existsSync } from "fs";

const BASE_URL = "https://workspace.hadona.id";
const STATE = "/tmp/hadona-qa-state.json";
const MARKERS = ["Kartu dikembalikan", "sisanya diblokir izin", "move_task_secure"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(existsSync(STATE) ? { storageState: STATE } : {}),
  });
  const page = await context.newPage();
  const scripts = new Set();
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/_next/") && url.endsWith(".js")) scripts.add(url);
  });

  if (!existsSync(STATE)) {
    console.error("💥 Tidak ada storage state QA (/tmp/hadona-qa-state.json).");
    process.exit(1);
  }

  // Buat halaman tasks termuat penuh (board lazy-load chunk besar)
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 60000 });
  await sleep(3000);

  if (page.url().includes("/login")) {
    console.error("💥 SESI INVALID — diarahkan ke login");
    await page.screenshot({ path: "scripts/screenshots/v99-login-fail.png" });
    await browser.close();
    process.exit(1);
  }
  await sleep(5000);

  console.log(`📦 Chunk JS termuat: ${scripts.size}`);

  const found = {};
  for (const url of scripts) {
    try {
      const body = await (await page.request.get(url)).text();
      for (const m of MARKERS) {
        if (body.includes(m)) found[m] = (found[m] || 0) + 1;
      }
    } catch {}
  }

  console.log("═══ MARKER KODE v99 DI BUNDLE PRODUKSI ═══");
  let ok = true;
  for (const m of MARKERS) {
    if (found[m]) console.log(`  ✅ "${m}" → ${found[m]} chunk`);
    else { console.log(`  ❌ "${m}" TIDAK ditemukan`); ok = false; }
  }

  await page.screenshot({ path: "scripts/screenshots/v99-tasks-prod.png", fullPage: false });
  await browser.close();

  if (!ok) {
    console.error("\n💥 Bundle produksi BELUM mengandung fix v99.");
    process.exit(1);
  }
  console.log("\n🎉 BUNDLE v99 TERDEPLOY — fix drag-drop & partial-permission live di produksi.");
}

main().catch((e) => { console.error("💥", e.message); process.exit(1); });