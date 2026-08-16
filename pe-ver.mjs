import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8912/#topic/orders:create', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// find version chips
const chips = await page.locator('text=VERSION').first().locator('..').innerText();
console.log('VERSION BLOCK:', chips);
for (const v of ['v1','v2']) {
  const el = page.getByRole('button', { name: v, exact: true }).first();
  const n = await el.count();
  console.log('--- clicking', v, 'buttoncount', n);
  if (n) { await el.click(); } else {
    const l = page.getByRole('link', { name: v, exact: true }).first();
    console.log('link count', await l.count());
    if (await l.count()) await l.click();
  }
  await page.waitForTimeout(1200);
  console.log('URL:', page.url());
  const body = await page.locator('body').innerText();
  const i = body.indexOf('TRAFFIC');
  console.log(body.slice(i, i+700));
}
await browser.close();
