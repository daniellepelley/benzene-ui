import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1800} });
await p.goto('http://localhost:8930/#value', { waitUntil:'networkidle' }); await p.waitForTimeout(1600);
const t=await p.locator('body').innerText();
console.log(t.slice(t.indexOf('order:placed')));
console.log('=== dagger tooltips ===');
console.log((await p.evaluate(()=>[...document.querySelectorAll('[title]')].map(e=>'['+e.getAttribute('title')+'] "'+(e.innerText||'').replace(/\n/g,' ').slice(0,40)+'"'))).filter(x=>/obs|msg|†/.test(x)).slice(0,6).join('\n'));
await browser.close();
