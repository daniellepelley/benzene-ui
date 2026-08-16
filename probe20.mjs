import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
for (const svc of ['billing-api','ledger-api']) {
  await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: new RegExp('^'+svc+'$') }).nth(0).click();
  await page.waitForTimeout(2000);
  console.log("=== "+svc+" ===", page.url());
  console.log(await page.locator('body').innerText());
}
await browser.close();
