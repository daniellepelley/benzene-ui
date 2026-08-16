import { chromium } from 'playwright';
const routes = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
page.on('console', m => { if (m.type()==='error') console.log('[console.error]', m.text()); });
page.on('requestfailed', r => console.log('[requestfailed]', r.url(), r.failure()?.errorText));
page.on('response', r => { if (r.status()>=400) console.log('[http]', r.status(), r.url()); });
for (const r of routes) {
  await page.goto('http://localhost:8912/#' + r, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await page.waitForTimeout(1800);
  console.log('\n\n############ #' + r + ' ############');
  console.log(await page.locator('body').innerText());
}
await browser.close();
