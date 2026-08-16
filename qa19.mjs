import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1600} });
p.on('pageerror', e=>console.log('PAGE ERR '+e.message));
for (const r of ['#service/payments-api','#service/shipping-api']) {
  await p.goto('http://localhost:8930/'+r, { waitUntil:'networkidle' }); await p.waitForTimeout(1500);
  console.log('##### '+r);
  console.log(await p.locator('body').innerText());
  console.log('---LINKS: '+[...new Set(await p.locator('a').evaluateAll(as=>as.map(a=>a.getAttribute('href'))))].join(' , '));
}
await browser.close();
