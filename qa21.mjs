import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1600} });
for (const r of ['#topic/inventory%3Areserve@v1','#topic/inventory%3Areserve@v2','#topic/shipping%3Abook@v2']) {
  await p.goto('http://localhost:8930/'+r, { waitUntil:'networkidle' }); await p.waitForTimeout(1400);
  console.log('##### '+r);
  const t = await p.locator('body').innerText();
  console.log(t.split('◐')[1]);
  console.log('--- TOOLTIPS: '+(await p.evaluate(()=>[...document.querySelectorAll('[title]')].map(e=>'['+e.getAttribute('title')+'] "'+(e.innerText||'').replace(/\n/g,' ').slice(0,45)+'"'))).filter(x=>/handler|observ|declar|regist|trace|%|rate/i.test(x)).join(' ;; '));
}
await browser.close();
