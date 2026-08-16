import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>Array.from(document.querySelectorAll('tbody tr')).slice(0,6).map(tr=>tr.lastElementChild.innerHTML).join('\n')));
console.log('--- legend/footnote search:', await p.evaluate(()=>document.body.innerText.includes('†')));
await b.close();
