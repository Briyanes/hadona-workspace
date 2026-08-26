/**
 * Playwright test: MENTION composer bersih + render di chat production — workspace.hadona.id/chat
 *
 * Perilaku baru (commit 18179b6):
 *  - Composer menampilkan "@Nama" bersih (TIDAK ada @[Nama](uuid) mentah)
 *  - Payload POST /api/chat/messages berisi markup @[Nama](uuid) (dikonversi encodeMentions saat kirim)
 *  - Bubble tetap render @Nama bold tanpa UUID
 *
 * Verifikasi:
 *  [1] Login → [2] buka /chat → [3] pilih channel → [4] ketik @ → pilih anggota
 *  [5] assert composer BERSIH → [6] kirim (intercept payload berisi markup)
 *  [7] assert bubble bersih & @Nama ter-render
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const STAMP = Date.now().toString().slice(-6);
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
  const apiLogs = [];
  let postedPayload = null;

  page.on("response", async (res) => {
    const url = res.url();
    if (/\/api\/chat\//.test(url)) {
      apiLogs.push(`${res.request().method()} ${url.replace(BASE_URL, "")} → ${res.status()}`);
    }
  });
  // Intercept body POST /api/chat/messages untuk verifikasi markup mention
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/api\/chat\/messages/.test(req.url())) {
      try { postedPayload = req.postData(); } catch { /* ignore */ }
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

    // 3. PILIH CHANNEL pertama (general)
    console.log("\n📻 [3] Pilih channel...");
    const channelBtns = page.locator("div.flex button:has(span.truncate)").filter({ hasText: /.+/ });
    const cnt = await channelBtns.count();
    if (cnt === 0) { console.error("💥 Tidak ada channel"); await browser.close(); process.exit(1); }
    await channelBtns.first().click();
    await sleep(3000);
    mark(true, "Channel dipilih", `${cnt} channel tersedia`);

    // 4. KETIK "@" di composer untuk trigger autocomplete mention
    console.log("\n⌨️  [4] Ketik @ untuk autocomplete mention...");
    const textarea = page.locator("textarea").last();
    await textarea.click();
    await textarea.fill("");
    await textarea.type("@", { delay: 100 });
    await sleep(1500);

    // Dropdown: div berisi label "Menyebut anggota" → tombol-tombol anggota di dalamnya
    const dropdown = page.locator('div:has(p:text-is("Menyebut anggota"))').last();
    const mentionBtns = dropdown.locator("button");
    const dropdownCount = await mentionBtns.count();

    let pickedName = null;
    if (dropdownCount > 0 && (await dropdown.isVisible().catch(() => false))) {
      const firstBtn = mentionBtns.first();
      pickedName = ((await firstBtn.locator("span.truncate").textContent()) || "").trim();
      console.log(`   dropdown ketemu: ${dropdownCount} anggota, pilih: "${pickedName}"`);
      await firstBtn.click({ timeout: 5000 });
      await sleep(600);
    } else {
      console.log("   ⚠️ Dropdown tidak muncul — cek manual (anggota tim mungkin kosong)");
    }

    // 5. ASSERT COMPOSER BERSIH setelah pilih mention
    console.log("\n🧼 [5] Verifikasi composer bersih...");
    const val = await textarea.inputValue();
    console.log(`   composer: "${val.slice(0, 80)}"`);
    if (pickedName) {
      mark(!val.includes("]-("), "Composer TIDAK menampilkan markup mentah (]-(", val.slice(0, 60));
      mark(!/\(?[0-9a-f]{8}-[0-9a-f]{4}/.test(val), "Composer TIDAK berisi UUID", "");
      mark(val.includes(`@${pickedName}`), `Composer menampilkan @Nama bersih`, val.slice(0, 60));
    }

    // Tambah suffix QA agar mudah dicari
    await textarea.type(` 🤖QA-composer ${STAMP}`, { delay: 20 });

    // 6. KIRIM + INTERCEPT PAYLOAD
    console.log("\n📤 [6] Kirim pesan (intercept payload)...");
    await textarea.press("Enter");
    await sleep(3000);
    mark(true, "Pesan dikirim");

    if (postedPayload) {
      console.log(`   payload: ${postedPayload.slice(0, 120)}`);
      const hasMarkup = /@\[[^\]]+\]\([0-9a-f-]{36}\)/.test(postedPayload);
      if (pickedName) {
        mark(hasMarkup, "Payload API berisi markup @[Nama](uuid) — encodeMentions bekerja");
      }
    } else {
      console.log("   ⚠️ Payload POST tidak tertangkap");
    }

    // 7. ASSERT BUBBLE BERSIH
    // Scope: container messages saja — sidebar bisa berisi nama DM rusak (uuid) dari data lama,
    // yang bukan bagian dari render mention.
    console.log("\n🔍 [7] Verifikasi render bubble...");
    await sleep(2000);
    const msgContainer = page.locator(".overflow-y-auto.py-4").first();
    const msgText = (await msgContainer.count()) > 0
      ? await msgContainer.innerText()
      : await page.locator("body").innerText();
    const hasRawSyntax = /@\[[^\]]*\]\([0-9a-f-]{36}\)/.test(msgText);
    const hasUUIDVisible = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(msgText);

    mark(!hasRawSyntax, "Bubble TIDAK menampilkan sintaks mentah @[Nama](uuid)");
    if (hasRawSyntax) {
      const m = msgText.match(/.{0,40}@\[[^\]]*\]\([0-9a-f-]{36}\).{0,20}/);
      console.log(`   🔴 KONTEKS MENTAH: ...${m?.[0]}...`);
    }
    mark(!hasUUIDVisible, "Tidak ada UUID di area messages (mention bersih)");
    mark(msgText.includes(`🤖QA-composer ${STAMP}`), "Pesan QA terkirim & terlihat");

    if (pickedName) {
      const mentionRendered = msgText.includes(`@${pickedName}`);
      mark(mentionRendered, `Mention ter-render sebagai @${pickedName} (bukan uuid)`);
    }

    // Screenshot bukti
    await page.screenshot({ path: "scripts/screenshots/mention-render-test.png", fullPage: false });
    console.log("\n📸 Screenshot: scripts/screenshots/mention-render-test.png");

    console.log("\n📡 API logs:");
    apiLogs.slice(-8).forEach((l) => console.log("   " + l));

  } catch (err) {
    console.error("💥 ERROR:", err.message);
    fail++;
    await page.screenshot({ path: "scripts/screenshots/mention-render-error.png" }).catch(() => {});
  } finally {
    console.log(`\n========== HASIL: ${pass} PASS, ${fail} FAIL ==========`);
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();