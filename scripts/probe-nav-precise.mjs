import { chromium } from 'playwright';
const BASE = 'https://workspace.hadona.id';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE + '/login', { waitUntil: 'networkidle', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.fill('input[type="email"]', 'admin@hadona.id');
await page.fill('input[type="password"]', '@Yogyakarta2026');
await page.locator('button[type="submit"]').first().click();
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }).catch(() => {});
await page.goto(BASE + '/ads-spend', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(800);
const out = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Mobile bottom navigation"]');
  const navR = nav.getBoundingClientRect();
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '← Prev');
  const btnR = btn ? btn.getBoundingClientRect() : null;
  return {
    navTop: Math.round(navR.top), navBottom: Math.round(navR.bottom), navH: Math.round(navR.height),
    btnTop: btnR ? Math.round(btnR.top) : null, btnBottom: btnR ? Math.round(btnR.bottom) : null,
    overlapPx: btnR ? Math.round(btnR.bottom - navR.top) : null,
  };
});
console.log(JSON.stringify(out));
await browser.close();
