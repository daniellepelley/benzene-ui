import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:1400}});
await p.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
const rows = p.locator('tbody tr');
const n = await rows.count();
for (let i=0;i<n;i++){ const txt = await rows.nth(i).innerText(); if (txt.includes('payment:capture') && txt.includes('v2')) { await rows.nth(i).click(); break; } }
await p.waitForTimeout(2000);
console.log('URL', p.url());
let t = await p.locator('body').innerText();
console.log('=== ===\n' + t.slice(t.indexOf('TRAFFIC'), t.indexOf('TRAFFIC')+560));
for (const v of ['v1','v2']) {
  const btn = p.getByRole('button',{name:v,exact:true}).first();
  if (await btn.count()===0){ console.log('no button', v); continue; }
  await btn.click(); await p.waitForTimeout(1200);
  t = await p.locator('body').innerText();
  console.log('\n=== after '+v+' ('+p.url()+') ===\n' + t.slice(t.indexOf('TRAFFIC'), t.indexOf('TRAFFIC')+560));
}
await b.close();
