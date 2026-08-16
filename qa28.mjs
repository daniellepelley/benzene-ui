import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1800} });
p.on('pageerror',e=>console.log('PAGE ERR '+e.message));
for (const r of ['#changes','#value']) {
  await p.goto('http://localhost:8930/'+r, { waitUntil:'networkidle' }); await p.waitForTimeout(1600);
  console.log('##### '+r);
  console.log((await p.locator('body').innerText()).split('◐')[1]);
}
await browser.close();
