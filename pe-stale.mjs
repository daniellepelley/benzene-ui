import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1200}});
await page.goto('http://localhost:8912/#topic/payment:capture',{waitUntil:'networkidle'});
await page.waitForTimeout(3000);
let b = await page.locator('body').innerText();
console.log('--- healthy: header ---'); console.log(b.split('Estate\nChanges')[0]);
console.log('--- healthy traffic ---'); console.log(b.slice(b.indexOf('TRAFFIC'), b.indexOf('TRAFFIC')+300));
await page.route('**/benzene/invoke', r => r.abort('failed'));
for (const t of [15000, 45000]) {
  await page.waitForTimeout(t===15000?15000:30000);
  b = await page.locator('body').innerText();
  console.log('\n--- after ~'+t/1000+'s of failed polls ---');
  console.log(b.split('Estate\nChanges')[0]);
  console.log(b.slice(b.indexOf('TRAFFIC'), b.indexOf('TRAFFIC')+320));
}
await browser.close();
