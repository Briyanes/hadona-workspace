import { chromium } from 'playwright';
const BASE = process.argv[2] || 'https://workspace.hadona.id';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.fill('input[type="email"]', process.env.TEST_EMAIL);
await page.fill('input[type="password"]', process.env.TEST_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }).catch(() => {});

for (const path of ['/calendar', '/ads-spend']) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    return new Promise(r => setTimeout(() => {
      const nav = document.querySelector('nav');
      const navR = nav ? nav.getBoundingClientRect() : null;
      const main = document.querySelector('main');
      const cs = main ? getComputedStyle(main) : null;
      const out = {
        path: location.pathname,
        scrollY: window.scrollY,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        navRect: navR ? { top: navR.top, h: navR.height } : null,
        mainPaddingBottom: cs ? cs.paddingBottom : null,
        flagged: []
      };
      // cari elemen bertuliskan kunci
      const keys = ['Prev', 'Kontrak'];
      for (const el of document.querySelectorAll('button, a, [class*="event"], div')) {
        const t = (el.textContent || '').trim();
        const key = keys.find(k => t.includes(k));
        if (!key || t.length > 60) continue;
        const r = el.getBoundingClientRect();
        if (!navR) break;
        const overlap = r.bottom > navR.top + 4 && r.top < navR.bottom;
        if (overlap) {
          // cek ancestor scroll-container
          let anc = el.parentElement, innerScroll = null;
          while (anc && anc !== document.body) {
            const s = getComputedStyle(anc);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && anc.scrollHeight > anc.clientHeight + 4) {
              innerScroll = { tag: anc.tagName, cls: (anc.className + '').slice(0, 60), scrollHeight: anc.scrollHeight, clientHeight: anc.clientHeight, canScrollMore: anc.scrollTop < anc.scrollHeight - anc.clientHeight - 2 };
              break;
            }
            anc = anc.parentElement;
          }
          out.flagged.push({ text: t.slice(0, 40), tag: el.tagName, top: Math.round(r.top), bottom: Math.round(r.bottom), innerScroll });
          if (out.flagged.length >= 4) break;
        }
      }
      r(out);
    }, 800));
  });
  console.log(JSON.stringify(info, null, 1));
}
await browser.close();
