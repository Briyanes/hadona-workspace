/**
 * Patch scripts/playwright-chatbox-test.mjs — sisipkan GAP ASSERTION (boundingBox pill↔bubble)
 * Setelah: mark(badge > 0 || reactionPosted, "Reaction 👍 tersimpan", ...)
 * Sebelum : await page.screenshot({ path: "scripts/screenshots/chatbox-reaction.png" });
 * Idempotent: skip jika sudah ada marker [GAP ASSERTION].
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "scripts/playwright-chatbox-test.mjs";
let src = readFileSync(FILE, "utf8");

if (src.includes("[GAP ASSERTION]")) {
  console.log("SKIP — GAP ASSERTION sudah ada");
  process.exit(0);
}

const ANCHOR = `        mark(badge > 0 || reactionPosted, "Reaction \u{1F44D} tersimpan",
          badge > 0 ? "badge tampil di bubble" : reactionPosted ? "POST 200 (badge mungkin beda format)" : "tidak ada POST sukses");
        await page.screenshot({ path: "scripts/screenshots/chatbox-reaction.png" });`;

if (!src.includes(ANCHOR)) {
  console.error("ANCHOR tidak ditemukan — struktur file berubah");
  process.exit(1);
}

const INJECT = `        mark(badge > 0 || reactionPosted, "Reaction \u{1F44D} tersimpan",
          badge > 0 ? "badge tampil di bubble" : reactionPosted ? "POST 200 (badge mungkin beda format)" : "tidak ada POST sukses");

        // [GAP ASSERTION] Pill harus DI LUAR & DI BAWAH bubble (mt-1 = 4px)
        // Patch lama (pill di dalam bubble + -mb-1.5) \u2192 gap negatif/overlap text
        if (badge > 0) {
          const pill = myRow.locator("button,span").filter({ hasText: /\u{1F44D}/ }).first();
          const pillBox = await pill.boundingBox();
          const textBox = await msgEl.boundingBox();
          if (pillBox && textBox) {
            const gap = pillBox.y - (textBox.y + textBox.height);
            mark(gap >= 1, \`Gap pill\u2194bubble = \${gap.toFixed(1)}px (\u22651px \u2192 pill di luar bubble)\`,
              gap < 1 ? "pill overlap/inside bubble \u2014 patch belum ter-deploy" : \`pill.y=\${pillBox.y.toFixed(0)} text.bottom=\${(textBox.y + textBox.height).toFixed(0)}\`);
            mark(Math.abs(pillBox.x - textBox.x) < 200, "Pill sejajar vertikal dgn bubble (wrapper flex-col)");
          } else {
            mark(false, "boundingBox pill/text tidak terukur");
          }
        }
        await page.screenshot({ path: "scripts/screenshots/chatbox-reaction.png" });`;

src = src.replace(ANCHOR, INJECT);
writeFileSync(FILE, src);
console.log("OK — GAP ASSERTION disisipkan");