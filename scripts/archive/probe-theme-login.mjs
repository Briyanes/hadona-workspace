import { chromium } from 'playwright';

const BASE = process.env.QA_BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(30000);

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('response', (r) => {
  const u = r.url();
  if (u.includes('supabase') && r.status() >= 400) errors.push(`${r.status()} ${u.slice(0, 120)}`);
});

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });

// Retry fill until React hydration catches up and button enables
let enabled = false;
for (let i = 0; i < 12; i++) {
  await page.fill('#email', '');
  await page.fill('#email', EMAIL);
  await page.fill('#password', '');
  await page.fill('#password', PASSWORD);
  enabled = await page
    .evaluate(() => {
      const b = document.querySelector('button[type="submit"]');
      return !!b && !b.disabled;
    })
    .catch(() => false);
  if (enabled) break;
  await page.waitForTimeout(2000);
}

console.log('Button enabled:', enabled);
if (!enabled) {
  console.log('FAILED: submit never enabled (hydration or validation issue)');
  console.log('Errors:', JSON.stringify(errors.slice(0, 5)));
  await page.screenshot({ path: 'scripts/tmp-login-stuck.png' });
  await browser.close();
  process.exit(1);
}

await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
await page.waitForTimeout(3000);

const url = page.url();
console.log('URL after login:', url);
console.log('Errors:', JSON.stringify(errors.slice(0, 5), null, 2));

if (!url.includes('/login')) {
  await page.context().storageState({ path: '/tmp/hadona-qa-state.json' });
  console.log('Saved storage state -> /tmp/hadona-qa-state.json');
}
await browser.close();