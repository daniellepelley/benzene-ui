import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /^shipping-api$/ }).nth(0).click();
await page.waitForTimeout(2000);
for (const el of await page.locator('[title]').all()) {
  const t = (await el.innerText()).replace(/\n/g,' ').slice(0,60);
  console.log(`TITLE "${t}" => ${await el.getAttribute('title')}`);
}
console.log("--- aria-labels ---");
for (const el of await page.locator('[aria-label]').all()) {
  const t = (await el.innerText()).replace(/\n/g,' ').slice(0,60);
  console.log(`ARIA "${t}" => ${await el.getAttribute('aria-label')}`);
}
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/08-shipping-svc.png', fullPage: true });
await browser.close();
