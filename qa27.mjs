import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1800} });
await p.goto('http://localhost:8930/#topic/payment%3Acapture@v1', { waitUntil:'networkidle' }); await p.waitForTimeout(1400);
const before=p.url();
await p.locator('button.bz-flow-toggle').click(); await p.waitForTimeout(1200);
let t=await p.locator('body').innerText(); console.log('after toggle: '+t.slice(t.indexOf('FLOWS'), t.indexOf('FLOWS')+700).replace(/\n+/g,' | '));
// try clicking the flow card itself
const card = p.locator('code:has-text("b2f5c8901ad34e77")').first();
const box = await card.boundingBox(); console.log('trace code box: '+JSON.stringify(box));
const parent = await p.evaluate(()=>{const c=[...document.querySelectorAll('code')].find(x=>x.innerText.includes('b2f5c890')); return c? c.parentElement.outerHTML.slice(0,400):'none';});
console.log('parent html: '+parent);
await browser.close();
