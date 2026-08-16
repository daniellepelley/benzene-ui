import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1600} });
const reqs=[]; p.on('request', r=>{const d=r.postData(); if(d&&d.includes('fleet')) reqs.push(d);});
await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' }); await p.waitForTimeout(2000);
const grab = async()=>{const t=await p.locator('body').innerText(); const i=t.indexOf('Needs attention'); return t.slice(i,i+260).replace(/\n+/g,' | ');};
console.log('15m: '+await grab());
for (const v of ['3600000','86400000']) { await p.locator('select').first().selectOption(v); await p.waitForTimeout(2500); console.log(v+': '+await grab()); }
console.log('FLEET QUERIES:\n'+reqs.join('\n'));
console.log('URL: '+p.url());
await browser.close();
