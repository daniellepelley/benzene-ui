import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:1400}});
await p.route('**/usage.json', r=>r.abort('failed'));
await p.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>Array.from(document.querySelectorAll('tbody tr')).map(t=>t.innerText.replace(/\s+/g,' ')).join('\n')));
await b.close();
