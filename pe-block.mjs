import { chromium } from 'playwright';
const [blockPat, ...routes] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.route(u => new RegExp(blockPat).test(u.toString()), r => r.abort('failed'));
for (const rt of routes) {
  await page.goto('http://localhost:8912/#' + rt, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await page.waitForTimeout(3000);
  console.log('\n\n######## BLOCK[' + blockPat + '] #' + rt + ' ########');
  console.log(await page.locator('body').innerText());
}
await browser.close();
