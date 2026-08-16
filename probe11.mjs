import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /^orders-api$/ }).nth(0).click();
await page.waitForTimeout(2500);
console.log("=== ORDERS-API === ", page.url());
console.log(await page.locator('body').innerText());
console.log("--- titles ---");
for (const el of await page.locator('[title]').all()) {
  const t = (await el.innerText()).replace(/\n/g,' ').slice(0,50);
  console.log(`TITLE "${t}" => ${await el.getAttribute('title')}`);
}
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/12-orders.png', fullPage: true });
await browser.close();
