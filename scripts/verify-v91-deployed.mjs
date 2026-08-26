/**
 * Verifikasi deploy f1e942e (chat WhatsApp-style v2) + status migration v91.
 * Cek:
 * 1. Halaman /chat render UI baru (tombol "Grup")
 * 2. API /api/chat/channels merespons OK
 * 3. Tabel chat_channel_members & chat_channel_calls ada di DB (indikasi migration v91 sudah dijalankan)
 */
import { chromium } from "playwright";
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE_URL = "https://workspace.hadona.id";
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkTable(name) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${name}?select=*&limit=1`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (res.ok) return { ok: true, status: res.status };
    if (res.status === 404) return { ok: false, status: 404 };
    return { ok: false, status: res.status, detail: (await res.text()).slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, detail: e.message };
  }
}

async function main() {
  let pass = 0, fail = 0;
  const mark = (ok, label, detail = "") => {
    console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
    ok ? pass++ : fail++;
  };

  // --- Bagian 1: DB (migration v91) ---
  console.log("\n📦 [1] Cek tabel migration v91 via REST:\n");
  const t1 = await checkTable("chat_channel_members");
  mark(t1.ok, "Tabel chat_channel_members", t1.ok ? "" : `HTTP ${t1.status} — jalankan supabase/migration-v91.sql di SQL Editor`);
  const t2 = await checkTable("chat_channel_calls");
  mark(t2.ok, "Tabel chat_channel_calls", t2.ok ? "" : `HTTP ${t2.status} — jalankan supabase/migration-v91.sql di SQL Editor`);

  // --- Bagian 2: UI production ---
  console.log("\n🌐 [2] Cek UI /chat di production:\n");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(1500);
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await sleep(4000);
    await page.goto(`${BASE_URL}/chat`, { waitUntil: "networkidle", timeout: 30000 });
    await sleep(5000);

    if (page.url().includes("/login")) {
      console.error("💥 LOGIN GAGAL");
      await page.screenshot({ path: "scripts/screenshots/verify-v91-login-fail.png" });
      await browser.close();
      process.exit(1);
    }
    console.log(`🌐 URL: ${page.url()}`);

    // Marker UI baru: tombol "Grup" di header sidebar channel
    const grupBtn = await page.locator('button:has-text("Grup")').count();
    mark(grupBtn > 0, `Tombol "Grup" di DOM (${grupBtn})`, grupBtn > 0 ? "" : "deploy belum selesai / bundle lama");

    // Error banner page (jika API crash, halaman tampil error state)
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const hasErrorState = /something went wrong|terjadi kesalahan|application error/i.test(bodyText);
    mark(!hasErrorState, "Halaman chat tanpa error state");

    // Cek API channels dari browser context (bawa cookie session)
    const apiRes = await page.evaluate(async () => {
      try {
        const r = await fetch("/api/chat/channels", { headers: { accept: "application/json" } });
        const text = await r.text();
        return { status: r.status, body: text.slice(0, 300) };
      } catch (e) {
        return { status: 0, body: e.message };
      }
    });
    mark(apiRes.status === 200, `GET /api/chat/channels → ${apiRes.status}`, apiRes.status === 200 ? "" : apiRes.body);

    // Jika UI oke: klik tombol Grup untuk buka modal create group
    if (grupBtn > 0) {
      await page.locator('button:has-text("Grup")').first().click();
      await sleep(2000);
      const modalText = await page.locator("body").innerText();
      const hasGroupModal = /nama grup|nama channel|buat grup/i.test(modalText);
      mark(hasGroupModal, "Modal buat Grup terbuka");
      await page.screenshot({ path: "scripts/screenshots/verify-v91-group-modal.png" });
    }

    await page.screenshot({ path: "scripts/screenshots/verify-v91-chat.png" });
  } catch (e) {
    console.error("💥 Error saat verifikasi UI:", e.message);
    fail++;
  } finally {
    await browser.close();
  }

  console.log(`\n📊 Hasil: ${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.log("\n⚠️ Jika tabel migration v91 belum ada → jalankan isi supabase/migration-v91.sql di Supabase Dashboard → SQL Editor.");
  }
  process.exit(fail > 0 ? 1 : 0);
}

main();