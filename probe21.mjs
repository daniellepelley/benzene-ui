import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log("--- estate tile titles ---");
for (const el of await page.locator('[title]').all()) {
  const t = (await el.innerText()).replace(/\n/g,' ').slice(0,55);
  console.log(`TITLE "${t}" => ${await el.getAttribute('title')}`);
}
await page.getByRole('button', { name: 'Changes', exact: true }).click();
await page.waitForTimeout(1500);
const sels = await page.locator('select').all();
console.log("selects on changes page:", sels.length);
await sels[0].selectOption({ label: 'orders-api' });
await page.waitForTimeout(1500);
console.log("=== filtered to orders-api ===");
console.log(await page.locator('body').innerText().then(t=>t.split('Field changes')[1]));
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/20-changes-orders.png', fullPage: true });
await browser.close();
