if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
  console.error("Set TEST_EMAIL and TEST_PASSWORD env vars first!");
  process.exit(1);
}

/** Probe: cari konteks UUID yang terlihat di halaman /chat production */
import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto("https://workspace.hadona.id/login", { waitUntil: "networkidle" });
await sleep(1500);
await page.locator('input[type="email"]').fill(process.env.TEST_EMAIL);
await page.locator('input[type="password"]').fill(process.env.TEST_PASSWORD);
await page.locator('button[type="submit"]').first().click();
await sleep(4000);
await page.goto("https://workspace.hadona.id/chat", { waitUntil: "networkidle" });
await sleep(5000);

// pilih channel general (pertama)
const btns = page.locator("div.flex button:has(span.truncate)").filter({ hasText: /.+/ });
await btns.first().click();
await sleep(3000);

const bodyText = await page.locator("body").innerText();
const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
let m;
const found = [];
while ((m = uuidRe.exec(bodyText)) !== null) {
  const start = Math.max(0, m.index - 60);
  found.push(bodyText.slice(start, m.index + m[0].length + 20).replace(/\n/g, " ⏎ "));
}
console.log(`UUID ditemukan: ${found.length}`);
found.slice(0, 10).forEach((c, i) => console.log(`\n[${i + 1}] ...${c}...`));

// Cek juga elemen mana yang memuatnya
if (found.length) {
  const el = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent;
      if (/[0-9a-f]{8}-[0-9a-f]{4}/.test(t)) {
        const parent = walker.currentNode.parentElement;
        hits.push({
          tag: parent?.tagName,
          cls: parent?.className?.slice(0, 80),
          text: t.slice(0, 120),
        });
        if (hits.length >= 5) break;
      }
    }
    return hits;
  });
  console.log("\nElemen pemuat UUID:");
  el.forEach((e) => console.log(`  <${e.tag} class="${e.cls}"> → "${e.text}"`));
}

await browser.close();