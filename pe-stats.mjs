import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1200}});
await page.route('**/benzene/invoke', async route => {
  const resp = await route.fetch();
  const j = await resp.json();
  const body = JSON.parse(j.body);
  for (const t of body.topics) if (t.topic === 'payment:capture') t.missingFeeds = ['stats'];
  route.fulfill({ contentType:'application/json', body: JSON.stringify({ ...j, body: JSON.stringify(body) }) });
});
await page.goto('http://localhost:8912/#topic/payment:capture@v1',{waitUntil:'networkidle'});
await page.waitForTimeout(3000);
const b = await page.locator('body').innerText();
console.log(b.slice(b.indexOf('TRAFFIC'), b.indexOf('TRAFFIC')+450));
await browser.close();
