import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on('pageerror', e => console.log('PAGE ERR: '+e.message));
const dump = async (label) => {
  const t = await page.locator('textarea').evaluateAll(ts=>ts.map(t=>t.value));
  const sels = await page.locator('select').evaluateAll(ss=>ss.map(s=>s.value));
  console.log('--- '+label+' | url='+page.url()+' | selects='+JSON.stringify(sels));
  console.log('HEADERS:\n'+t[0]+'\nBODY:\n'+t[1]);
};
await page.goto('http://localhost:8930/#compose/payment%3Acapture', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dump('deep-link #compose/payment:capture (no version)');
// switch payload version to v1
const vsel = page.locator('select').nth(1); // 0=live window
await vsel.selectOption('v1'); await page.waitForTimeout(800);
await dump('after selecting v1');
await vsel.selectOption('v2'); await page.waitForTimeout(800);
await dump('back to v2');
// transport http
const tsel = page.locator('select').nth(2);
await tsel.selectOption({ index: 1 }); await page.waitForTimeout(800);
await dump('transport=http');
console.log(await page.locator('body').innerText());
await browser.close();
