import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^payment:capture$/ }).nth(0).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /^v2$/ }).nth(0).click();
await page.waitForTimeout(1500);
for (const el of await page.locator('[title]').all()) {
  const t = (await el.innerText()).replace(/\n/g,' ').slice(0,55);
  console.log(`TITLE "${t}" => ${await el.getAttribute('title')}`);
}
console.log("--- search page text for 'train'/'together'/'deploy' ---");
const body = await page.locator('body').innerText();
for (const w of ['train','together','deploy','coupl','order of','sequence']) {
  const idx = body.toLowerCase().indexOf(w);
  console.log(w, idx>=0 ? JSON.stringify(body.slice(Math.max(0,idx-120), idx+180)) : 'ABSENT');
}
await browser.close();
