import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:1400}});
await p.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>Array.from(document.querySelectorAll('tbody tr'))
  .filter(tr=>/inventory|legacy|notification/.test(tr.innerText))
  .map(tr=>tr.innerText.replace(/\s+/g,' ')+'  ||  HTML:'+tr.lastElementChild.innerHTML).join('\n')));
console.log('\n--- estate tiles ---');
console.log(await p.evaluate(()=>Array.from(document.querySelectorAll('.bz-stat')).map(e=>e.innerText.replace(/\n/g,' ')).join(' / ')));
console.log('\n--- any legend for the dagger on the page? ---');
console.log(await p.evaluate(()=>{const t=document.body.innerText; const i=t.indexOf('†'); return JSON.stringify(t.slice(i-40,i+200));}));
await b.close();
