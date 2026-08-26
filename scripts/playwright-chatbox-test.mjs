/**
 * Playwright test CHAT BOX (composer) production — workspace.hadona.id/chat
 * Test: kirim pesan → bubble muncul → reaction emoji → reply → network diagnostics
 * Selector hover actions: button[title="React"] / button[title="Reply"] (dari source chat/page.tsx)
 */
import { chromium } from "playwright";

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const STAMP = Date.now().toString().slice(-6);
const MSG = `🤖 [QA Playwright ${STAMP}] test chat box — auto, abaikan`;
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

  // Network capture untuk POST messages/reactions
  const apiLogs = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (/\/api\/chat\/(messages|reactions)/.test(url)) {
      let body = "";
      try { body = (await res.text()).slice(0, 150); } catch {}
      apiLogs.push(`${res.request().method()} ${url.replace(BASE_URL, "")} → ${res.status()} ${body}`);
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

    // 3. PILIH CHANNEL (prioritas "general")
    console.log("\n📻 [3] Pilih channel...");
    const channelBtns = page.locator("div.flex button:has(span.truncate)").filter({ hasText: /.+/ });
    const channelCount = await channelBtns.count();
    mark(channelCount > 0, `Channel list ter-render (${channelCount} channel)`);
    if (channelCount === 0) throw new Error("Tidak ada channel di sidebar");
    let target = page.locator("button", { hasText: "general" }).first();
    if ((await target.count()) === 0) target = channelBtns.first();
    await target.click();
    await sleep(3000);
    mark(true, "Channel diklik & aktif");

    // 4. COMPOSER
    console.log("\n⌨️  [4] Cek composer...");
    const textarea = page.locator('textarea[placeholder^="Pesan ke"]');
    const taCount = await textarea.count();
    mark(taCount === 1, `Chat box textarea ada (${taCount})`);
    const taEnabled = taCount > 0 ? await textarea.first().isEnabled() : false;
    mark(taEnabled, "Textarea enabled");
    const sendBtn = page.locator('button[aria-label="Kirim pesan"]');
    mark((await sendBtn.count()) === 1, "Tombol kirim ada");
    if ((await sendBtn.count()) === 1) {
      mark(await sendBtn.first().isDisabled(), "Tombol kirim disabled saat input kosong (guard)");
    }

    // 5. KIRIM PESAN
    console.log("\n📤 [5] Kirim pesan test...");
    await textarea.first().click();
    await textarea.first().fill(MSG);
    await sleep(300);
    mark(!(await sendBtn.first().isDisabled()), "Tombol kirim enabled setelah isi teks");
    await sendBtn.first().click();
    await sleep(4000);

    const bubbleCount = await page.getByText(MSG, { exact: false }).count();
    mark(bubbleCount > 0, `Bubble pesan terkirim tampil (${bubbleCount} elemen)`);

    // Persist check: reload
    await page.reload({ waitUntil: "networkidle" });
    await sleep(5000);
    if ((await page.locator('textarea[placeholder^="Pesan ke"]').count()) === 0) {
      const ch = page.locator("div.flex button:has(span.truncate)").first();
      if ((await ch.count()) > 0) { await ch.click(); await sleep(3000); }
    }
    const bubbleAfterReload = await page.getByText(MSG, { exact: false }).count();
    mark(bubbleAfterReload > 0, "Pesan persist setelah reload (tersimpan di DB)");

    // 6. REACTION (hover bubble → action bar 😀 [title=React] → picker 👍)
    console.log("\n😄 [6] Test reaction...");
    const msgEl = page.getByText(MSG, { exact: false }).first();
    await msgEl.scrollIntoViewIfNeeded().catch(() => {});
    await msgEl.hover();
    await sleep(1500);
    await page.screenshot({ path: "scripts/screenshots/chatbox-hover.png" });
    const reactToggle = page.locator('button[title="React"]');
    const toggleVisible = (await reactToggle.count()) > 0 && (await reactToggle.first().isVisible().catch(() => false));
    if (toggleVisible) {
      mark(true, "Action bar muncul saat hover (😀 React / ↩ Reply / ✏ Edit / 🗑 Delete)");
      await reactToggle.first().click();
      await sleep(800);
      // Scope ke CONTAINER picker (div.absolute.z-50) — bukan semua button 👍
      // (badge 👍 di pesan lama akan tertutup backdrop z-40 → click timeout)
      const picker = page.locator("div.absolute.z-50");
      const thumbBtn = picker.locator("button", { hasText: "👍" }).first();
      const thumbVisible = await thumbBtn.isVisible().catch(() => false);
      mark(thumbVisible, "Emoji picker terbuka (👍 terlihat)");
      if (thumbVisible) {
        await thumbBtn.click();
        await sleep(3000);
        // Badge dicek dalam ROW pesan sendiri (bukan seluruh halaman)
        const myRow = page.locator("div.group.relative.flex").filter({ hasText: MSG }).first();
        const badge = await myRow.locator("button,span").filter({ hasText: /👍/ }).count();
        const reactionPosted = apiLogs.some((l) => l.includes("POST /api/chat/reactions") && l.includes("→ 2"));
        mark(badge > 0 || reactionPosted, "Reaction 👍 tersimpan",
          badge > 0 ? "badge tampil di bubble" : reactionPosted ? "POST 200 (badge mungkin beda format)" : "tidak ada POST sukses");

        // [GAP ASSERTION] Pill harus DI LUAR & DI BAWAH bubble (mt-1 = 4px)
        // Patch lama (pill di dalam bubble + -mb-1.5) → gap negatif/overlap text
        if (badge > 0) {
          const pill = myRow.locator("button,span").filter({ hasText: /👍/ }).first();
          const pillBox = await pill.boundingBox();
          const textBox = await msgEl.boundingBox();
          if (pillBox && textBox) {
            const gap = pillBox.y - (textBox.y + textBox.height);
            mark(gap >= 1, `Gap pill↔bubble = ${gap.toFixed(1)}px (≥1px → pill di luar bubble)`,
              gap < 1 ? "pill overlap/inside bubble — patch belum ter-deploy" : `pill.y=${pillBox.y.toFixed(0)} text.bottom=${(textBox.y + textBox.height).toFixed(0)}`);
          } else {
            mark(false, "boundingBox pill/text tidak terukur");
          }
        }
        await page.screenshot({ path: "scripts/screenshots/chatbox-reaction.png" });
      }
    } else {
      mark(false, 'Action bar hover tidak muncul', 'cek screenshot chatbox-hover.png');
    }

    // 7. REPLY (hover → button[title="Reply"] ↩)
    console.log("\n↩️  [7] Test reply...");
    await msgEl.hover();
    await sleep(1500);
    const replyBtn = page.locator('button[title="Reply"]');
    const replyVisible = (await replyBtn.count()) > 0 && (await replyBtn.first().isVisible().catch(() => false));
    if (replyVisible) {
      await replyBtn.first().click();
      await sleep(1000);
      const cancelReply = await page.locator('button:has-text("Batal")').count();
      mark(cancelReply > 0, "Preview reply aktif (banner + tombol Batal)");
      const ta = page.locator('textarea[placeholder^="Pesan ke"]').first();
      await ta.fill(`🤖 [QA ${STAMP}] balasan test`);
      await page.locator('button[aria-label="Kirim pesan"]').first().click();
      await sleep(3500);
      const replyBubble = await page.getByText(`🤖 [QA ${STAMP}] balasan test`, { exact: false }).count();
      mark(replyBubble > 0, "Reply terkirim & tampil");
      await page.screenshot({ path: "scripts/screenshots/chatbox-reply.png" });
    } else {
      mark(false, 'Tombol Reply (title="Reply") tidak muncul saat hover');
    }

    await page.screenshot({ path: "scripts/screenshots/chatbox-final.png", fullPage: false });
  } catch (e) {
    console.error("💥 ERROR:", e.message);
    fail++;
    await page.screenshot({ path: "scripts/screenshots/chatbox-error.png" }).catch(() => {});
  }

  // 8. NETWORK DIAGNOSTICS
  console.log("\n📡 [8] Network log chat API:");
  if (apiLogs.length === 0) console.log("   (tidak ada request chat API tertangkap)");
  apiLogs.slice(-10).forEach((l) => console.log("   " + l));

  await browser.close();
  console.log(`\n📊 HASIL: ${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}

main();