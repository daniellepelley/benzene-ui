import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:1400}});
for (let i=0;i<3;i++){
  await p.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
  const bodyTxt = (await p.locator('body').innerText());
  const j = bodyTxt.indexOf('SERVICES');
  console.log('run',i,'| body:',JSON.stringify(bodyTxt.slice(j-4,j+90)));
  console.log('      | stats:',await p.evaluate(()=>Array.from(document.querySelectorAll('.bz-stat')).map(e=>e.innerText.replace(/\n/g,' ')).join(' / ')));
  console.log('      | seeall:',await p.evaluate(()=>{const e=document.querySelector('.bz-section-more'); return e?e.innerText:null;}));
}
await b.close();
