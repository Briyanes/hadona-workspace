/**
 * E2E: Buat 1 client baru + OKR lengkap (2 Objective × 4 KR) via wizard
 * "Client Baru" di dashboard /strategy — lalu verifikasi tampilnya canvas.
 *
 * Env:
 *   AUDIT_BASE_URL  — default: https://workspace.hadona.id
 *   AUDIT_EMAIL     — required (env)
 *   AUDIT_PASSWORD  — required (env)
 */
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE_URL = process.env.AUDIT_BASE_URL || "https://workspace.hadona.id";
const EMAIL = process.env.AUDIT_EMAIL;
const PASSWORD = process.env.AUDIT_PASSWORD;
const DIR = "scripts/screenshots/create-client-okr";
mkdirSync(DIR, { recursive: true });

// Nama unik agar idempotent saat re-run
const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "");
const CLIENT_NAME = `Senja Coffee QA ${stamp}`;

// ── Konten OKR (disusun sebagai OKR expert: leading + lagging mix) ──
const OBJ1 = "Meningkatkan brand awareness melalui sosial media";
const OBJ2 = "Meningkatkan sales melalui iklan CTWA";
const KR_OBJ1 = [
  { kr: "Mencapai 1.000.000 views organik per bulan", metric: "Views organik", baseline: "250000", target: "1000000", unit: "views", type: "leading" },
  { kr: "Meningkatkan followers IG dari 3.500 menjadi 8.000", metric: "Pertumbuhan followers", baseline: "3500", target: "8000", unit: "followers", type: "leading" },
  { kr: "Memproduksi 20 konten video Reels/TikTok per bulan", metric: "Output konten", baseline: "8", target: "20", unit: "konten", type: "leading" },
  { kr: "Mempertahankan engagement rate minimal 4%", metric: "Engagement rate", baseline: "2.5", target: "4", unit: "%", type: "lagging" },
];
const KR_OBJ2 = [
  { kr: "Mencapai ROAS 3.5x dari iklan CTWA", metric: "ROAS", baseline: "1.8", target: "3.5", unit: "x", type: "lagging" },
  { kr: "Mencapai 300 percakapan WhatsApp dari iklan CTWA per bulan", metric: "Percakapan WA", baseline: "90", target: "300", unit: "chat", type: "leading" },
  { kr: "Mencapai penyerapan budget iklan 95% dari alokasi bulanan", metric: "Budget absorption", baseline: "70", target: "95", unit: "%", type: "leading" },
  { kr: "Meningkatkan closing rate percakapan menjadi 20%", metric: "Closing rate", baseline: "8", target: "20", unit: "%", type: "lagging" },
];

const results = [];
const check = (name, ok, extra = "") => {
  results.push(`${ok ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/** Isi 1 blok Key Result di dalam kartu objective */
async function fillKr(krBlock, d) {
  await krBlock.locator('input[placeholder="Contoh: Mencapai ROAS 5"]').fill(d.kr);
  await krBlock.locator('input[placeholder="Metrik (ROAS)"]').fill(d.metric);
  await krBlock.locator('input[placeholder="Baseline"]').fill(d.baseline);
  await krBlock.locator('input[placeholder="Target *"]').fill(d.target);
  await krBlock.locator('input[placeholder="Unit (x, IDR)"]').fill(d.unit);
  await krBlock.locator("select").first().selectOption(d.type); // select pertama = kr_type
}

try {
  // ── 1. Login ──
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForTimeout(2000);
  check("Login berhasil", true, EMAIL);

  // ── 2. Buka /strategy & wizard ──
  await page.goto(`${BASE_URL}/strategy`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${DIR}/01-strategy-page.png`, fullPage: true });

  await page.click("button:has-text('Client Baru')");
  await page.waitForSelector("h2:has-text('Client Strategy Canvas')", { timeout: 10000 });
  check("Wizard 'Client Baru' terbuka", true);

  const nextBtn = page.locator("button:has-text('Lanjut')");

  // ── 3. Step 1: Profil ──
  await page.fill('input[placeholder="Contoh: RMODA Studio BSD"]', CLIENT_NAME);
  await page.fill('textarea[placeholder*="Adalah brand coating"]',
    "Brand kopi specialty lokal dengan konsep cozy cafe, fokus retail minuman & beans, target audiens pekerja muda urban.");
  await page.fill('input[placeholder="Contoh: BSD, Tangerang"]', "Jakarta Selatan");
  await page.click('button:has-text("Meta Ads (CTWA)")');
  await page.click('button:has-text("Social Media Management")');
  await page.screenshot({ path: `${DIR}/02-step-profil.png` });
  await nextBtn.click();

  // ── 4. Step 2: Sosmed ──
  await page.fill('input[placeholder="@handle"]', "@senjacoffee.qa");
  await page.fill('input[placeholder="Followers baseline"]', "3500");
  await page.check('label:has-text("Terhubung ads") input');
  await page.screenshot({ path: `${DIR}/03-step-sosmed.png` });
  await nextBtn.click();

  // ── 5. Step 3: Kompetitor ──
  await page.click("button:has-text('Tambah Kompetitor')");
  const comp = page.locator("div.card.space-y-3.p-4").last();
  await comp.locator('input[placeholder="Nama kompetitor"]').fill("Kopi Senja Pagi");
  await comp.locator("select").first().selectOption("instagram");
  await comp.locator('input[placeholder="@handle"]').fill("@kopisenjapagi");
  await comp.locator('input[placeholder="Followers"]').fill("25000");
  await comp.locator('input[placeholder="ER %"]').fill("3.5");
  await comp.locator('input[placeholder="4x/minggu"]').fill("5x/minggu");
  await comp.locator('input[placeholder*="Positioning / kekuatan"]').fill("Bundling promo & gratis ongkir");
  await comp.locator('input[placeholder*="Kelemahan / content gap"]').fill("Konten edukasi barista & storytelling minim");
  await page.screenshot({ path: `${DIR}/04-step-kompetitor.png` });
  await nextBtn.click();

  // ── 6. Step 4: OKR (inti) ──
  await page.waitForSelector("text=Objective #1", { timeout: 5000 });

  // Objective 1 + 4 KR
  const objInput = page.locator('input[placeholder="Contoh: Meningkatkan sales melalui iklan CTWA"]');
  const objCard = page.locator("div.card.space-y-3.p-4");
  await objInput.first().fill(OBJ1);
  await fillKr(objCard.first().locator("div.rounded-md.border-border").first(), KR_OBJ1[0]);
  for (let i = 1; i < 4; i++) {
    await objCard.first().locator("button:has-text('Tambah KR')").click();
    await fillKr(objCard.first().locator("div.rounded-md.border-border").last(), KR_OBJ1[i]);
  }
  await page.screenshot({ path: `${DIR}/05-step-okr-obj1.png` });

  // Objective 2 + 4 KR
  await page.click("button:has-text('Tambah Objective')");
  await objInput.last().fill(OBJ2);
  await fillKr(objCard.last().locator("div.rounded-md.border-border").first(), KR_OBJ2[0]);
  for (let i = 1; i < 4; i++) {
    await objCard.last().locator("button:has-text('Tambah KR')").click();
    await fillKr(objCard.last().locator("div.rounded-md.border-border").last(), KR_OBJ2[i]);
  }
  await page.screenshot({ path: `${DIR}/06-step-okr-obj2.png` });
  check("Wizard OKR terisi (2 Objective × 4 KR)", true);
  await nextBtn.click();

  // ── 7. Step 5: 4M & Initiatives ──
  await page.fill('input[placeholder="Meningkatkan traffic & revenue client"]',
    "Meningkatkan traffic dan interaction melalui sosial media");
  await page.fill('input[placeholder="Yoga, Ovi"]', "Tim konten 2 orang, ads specialist 1 orang");
  await page.fill('input[placeholder="Fanpage, ad account, akses IG"]', "Akses IG & TikTok, Meta Ads Manager, Pixel");
  await page.fill('input[placeholder="Rp 16.800.000 / bulan"]', "Rp 15.000.000 / bulan");
  await page.click("button:has-text('Tambah Initiative')");
  await page.fill(
    'input[placeholder*="Mengiklankan hero product"]',
    "Produksi 8 konten edukasi 'anatomy of coffee' untuk testing hook iklan bulan pertama"
  );
  await page.screenshot({ path: `${DIR}/07-step-4m.png` });
  await nextBtn.click();

  // ── 8. Step 6: SOP timeline (biarkan aktif) ──
  await page.waitForSelector("text=tasks SOP onboarding", { timeout: 5000 });
  const sopCount = await page.locator("div.card.divide-y span.text-foreground").count();
  check(`Preview SOP tasks tampil (${sopCount} tasks)`, sopCount > 0);
  await page.screenshot({ path: `${DIR}/08-step-sop.png` });

  // ── 9. Submit ──
  await page.click("button:has-text('Buat Client + Canvas')");
  await Promise.race([
    page.waitForSelector("text=berhasil dibuat", { timeout: 45000 }),
    page.waitForSelector("text=Gagal menyimpan", { timeout: 45000 }),
  ]);
  await page.screenshot({ path: `${DIR}/09-after-submit.png` });

  const saveFailed = await page.locator("text=Gagal menyimpan").count();
  if (saveFailed > 0) {
    check("Submit wizard (Buat Client + Canvas)", false, "toast error 'Gagal menyimpan' muncul");
  } else {
    check("Submit wizard (Buat Client + Canvas)", true, `toast sukses untuk "${CLIENT_NAME}"`);
    await page.waitForSelector("h2:has-text('Client Strategy Canvas')", { state: "hidden", timeout: 15000 });
  }

  // ── 10. Verifikasi canvas via ClientPicker ──
  await page.goto(`${BASE_URL}/strategy`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  await page.click("button:has-text('Pilih client')");
  await page.waitForTimeout(800);
  const search = page.locator("input[placeholder*='Cari client']");
  await search.fill(CLIENT_NAME);
  await page.waitForTimeout(600);
  const item = page.locator("div.max-h-72 button", { hasText: CLIENT_NAME }).first();
  const itemFound = (await item.count()) > 0;
  check("Client baru muncul di ClientPicker", itemFound, CLIENT_NAME);
  await page.screenshot({ path: `${DIR}/10-picker-found.png` });

  if (itemFound) {
    await item.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${DIR}/11-canvas-client.png`, fullPage: true });

    // Profil card menampilkan nama
    check("Kartu Profil menampilkan nama client",
      (await page.locator("h3", { hasText: CLIENT_NAME }).count()) > 0);

    // Aset digital: instagram + Ads ✓
    check("Aset Digital: IG + terhubung ads",
      (await page.locator("text=instagram").count()) > 0 && (await page.locator("text=Ads ✓").count()) > 0);

    // 2 objective OKR tampil
    const ok1 = (await page.locator("h3", { hasText: OBJ1 }).count()) > 0;
    const ok2 = (await page.locator("h3", { hasText: OBJ2 }).count()) > 0;
    check(`Objective 1 tampil: "${OBJ1}"`, ok1);
    check(`Objective 2 tampil: "${OBJ2}"`, ok2);

    // Total 8 KR
    const krHeader = await page.locator("span.text-xs.text-muted", { hasText: "8 KR" }).count();
    check("Header OKR menunjukkan 8 KR", krHeader > 0);

    // Kompetitor benchmark masuk
    check("Benchmark kompetitor tampil",
      (await page.locator("text=Kopi Senja Pagi").count()) > 0);

    // Principles 4M masuk
    check("Principles 4M tampil (Mind Power)",
      (await page.locator("text=Man Power").count()) > 0);
  }
} catch (err) {
  results.push(`❌ ERROR: ${err.message}`);
  await page.screenshot({ path: `${DIR}/99-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n═══ HASIL E2E: CREATE CLIENT + OKR ═══`);
console.log(`Client: ${CLIENT_NAME}`);
results.forEach((r) => console.log(r));
const fail = results.filter((r) => r.startsWith("❌")).length;
console.log(`\n${fail === 0 ? "SEMUA PASS" : `${fail} CHECK GAGAL`} — screenshot: ${DIR}/`);