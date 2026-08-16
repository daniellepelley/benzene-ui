import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// click the service card for payments-api in Services list
await page.locator('button', { hasText: 'payments-api' }).nth(0).scrollIntoViewIfNeeded();
await page.getByText('payments-api', { exact: true }).nth(0).click();
await page.waitForTimeout(2500);
console.log("URL:", page.url());
console.log(await page.locator('body').innerText());
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/05-payments.png', fullPage: true });
await browser.close();
