import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on('pageerror', e => console.log('PAGE ERR: '+e.message));
await page.goto('http://localhost:8930/#fleet', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// click the spec link for shipping-api
const [pop] = await Promise.all([
  page.context().waitForEvent('page').catch(()=>null),
  page.getByRole('link', { name: 'spec' }).first().click().catch(e=>console.log('click fail', e.message))
]);
await page.waitForTimeout(2000);
const target = pop || page;
console.log('AFTER SPEC CLICK URL:', target.url());
console.log((await target.locator('body').innerText()).slice(0,1200));
await browser.close();
