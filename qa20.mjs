import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1600} });
await p.goto('http://localhost:8930/#service/shipping-api', { waitUntil:'networkidle' }); await p.waitForTimeout(1500);
console.log('=== TITLE/ARIA attrs on service page ===');
console.log((await p.evaluate(()=>[...document.querySelectorAll('[title],[aria-label]')].map(e=>e.tagName+' ['+(e.getAttribute('title')||e.getAttribute('aria-label'))+'] text="'+(e.innerText||'').replace(/\n/g,' ').slice(0,50)+'"'))).join('\n'));
console.log('=== calls block html ===');
console.log((await p.evaluate(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.innerText&&e.innerText.trim().startsWith('INBOUND')); return el?el.outerHTML.slice(0,1500):'none';})));
await browser.close();
