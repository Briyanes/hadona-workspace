/**
 * Playwright test CHAT BUBBLE ALIGNMENT — workspace.hadona.id/chat
 * Bug yang dites: pesan sendiri tampil di KIRI (harusnya KANAN ala WhatsApp).
 * Akar bug: /api/team tidak kirim `is_me`/`me` → currentUser kosong di client →
 *           isMine selalu false → justify-start.
 * Fix: /api/team kirim `me` + `is_me`; client fallback auth.getUser().
 *
 * Test: login → buka /chat → cek /api/team punya `me`/`is_me` →
 *       kirim pesan → assert bubble-nya ada class `justify-end` (kanan).
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = "admin@hadona.id";
const PASSWORD = "@Yogyakarta2026";
const STAMP = Date.now().toString().slice(-6);
const MSG = `🧪 [QA alignment ${STAMP}] bubble harus di kanan — auto, abaikan`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const mark = (ok, label, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let teamPayload = null;
  page.on("response", async (res) => {
    if (res.url().includes("/api/team")) {
      try { teamPayload = await res.json(); } catch {}
    }
  });

  try {
    // 1. LOGIN
    console.log("\n🔐 [1] Login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(1500);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await sleep(4000);
    if (page.url().includes("/login")) {
      console.error("💥 LOGIN GAGAL"); await browser.close(); process.exit(1);
    }
    mark(true, "Login sukses");

    // 2. BUKA CHAT
    console.log("\n🌐 [2] Buka /chat...");
    await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);
    mark(!page.url().includes("/login"), "Halaman /chat terbuka", page.url());

    // 3. CEK API /api/team: harus ada `me` atau anggota dengan is_me
    console.log("\n👥 [3] Validasi payload /api/team...");
    await sleep(2000);
    const hasMe = !!(teamPayload?.me);
    const hasIsMeFlag = !!(teamPayload?.team || teamPayload?.members || []).some((u) => u.is_me);
    mark(hasMe || hasIsMeFlag, "/api/team mengirim identitas 'me' (is_me)",
      hasMe ? "objek me ✓" : hasIsMeFlag ? "flag is_me ✓" : "TIDAK ADA — fix belum deploy");
    if (teamPayload) {
      console.log(`   payload keys: ${Object.keys(teamPayload).join(", ")}`);
    }

    // 4. KIRIM PESAN
    console.log("\n✍️ [4] Kirim pesan uji...");
    const composer = page.locator("textarea").first();
    await composer.fill(MSG);
    await composer.press("Enter");
    await sleep(4000);

    // 5. CEK ALIGNMENT BUBBLE
    console.log("\n📐 [5] Cek alignment bubble pesan sendiri...");
    const bubbleRow = page.locator("div.group.relative.flex", { hasText: MSG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }).first();
    const bubbleVisible = await bubbleRow.count();
    if (bubbleVisible === 0) {
      mark(false, "Bubble pesan ditemukan", "pesan tidak muncul di DOM");
    } else {
      const classAttr = await bubbleRow.getAttribute("class");
      const isRight = classAttr?.includes("justify-end") ?? false;
      const isLeft = classAttr?.includes("justify-start") ?? false;
      mark(isRight && !isLeft, "Pesan sendiri ada di KANAN (justify-end)",
        isRight ? `class: ${classAttr.slice(0, 80)}` : `MASIH KIRI: ${classAttr?.slice(0, 80)}`);

      // Verifikasi visual: bubble harus dekat sisi kanan kontainer
      try {
        const rowBox = await bubbleRow.boundingBox();
        const container = page.locator("div.flex-1.overflow-y-auto").first();
        const containerBox = await container.boundingBox();
        if (rowBox && containerBox) {
          const rightGap = containerBox.x + containerBox.width - (rowBox.x + rowBox.width);
          const leftGap = rowBox.x - containerBox.x;
          mark(rightGap < leftGap, "Posisi visual: bubble lebih dekat ke kanan",
            `leftGap=${Math.round(leftGap)}px, rightGap=${Math.round(rightGap)}px`);
        }
      } catch (e) {
        console.log(`   (skip cek visual: ${e.message})`);
      }
    }

    // Summary
    console.log(`\n📊 HASIL: ${pass} pass, ${fail} fail`);
    await page.screenshot({ path: "scripts/screenshots/chat-alignment-test.png", fullPage: false });
    console.log("📸 Screenshot: scripts/screenshots/chat-alignment-test.png");

  } catch (err) {
    console.error("💥 Error:", err.message);
    fail++;
  } finally {
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();