import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.getByText('shipping-api', { exact: true }).nth(0).click();
await page.waitForTimeout(2500);
console.log("=== SHIPPING-API === URL:", page.url());
console.log(await page.locator('body').innerText());
// hover chips for tooltips
for (const el of await page.locator('[title]').all()) {
  const t = (await el.innerText()).replace(/\n/g,' ').slice(0,50);
  console.log(`TITLE-ATTR on "${t}" => ${await el.getAttribute('title')}`);
}
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/06-shipping.png', fullPage: true });
await browser.close();
