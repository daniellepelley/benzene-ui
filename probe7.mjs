import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// Services section: click the service name heading inside the Services list
const svc = page.locator('button:has-text("shipping-api")');
const n = await svc.count();
console.log("candidate buttons:", n);
// find the one in the Services region
await page.getByRole('button', { name: /^shipping-api$/ }).nth(0).click();
await page.waitForTimeout(2000);
console.log("URL after click:", page.url());
console.log(await page.locator('body').innerText());
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/07-shipping-svc.png', fullPage: true });
await browser.close();
