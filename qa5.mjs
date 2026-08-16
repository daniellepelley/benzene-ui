import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on('pageerror', e => console.log('PAGE ERR: '+e.message));
await page.goto('http://localhost:8930/#fleet', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// second row of topics table = payment:capture v2
const rows = page.locator('button.bz-topic-name', { hasText: 'payment:capture' });
console.log('count of payment:capture buttons:', await rows.count());
await rows.nth(2).click();  // 0 = contract card, 1 = v1 row, 2 = v2 row? we'll see
await page.waitForTimeout(2000);
console.log('URL:', page.url());
console.log(await page.locator('body').innerText());
await browser.close();
