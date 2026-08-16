import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1400} });
const paths=[];
await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' });
await p.waitForTimeout(1500);
// find every clickable that mentions order:placed
const cands = p.locator('button, a, [role=button], td');
const n = await cands.count();
let found=[];
for (let i=0;i<n;i++){
  const el = cands.nth(i);
  const t = (await el.innerText().catch(()=>''))?.trim();
  if (t === 'order:placed') found.push(i);
}
console.log('candidates with exact text order:placed:', found.length);
for (const i of found.slice(0,3)) {
  await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' }); await p.waitForTimeout(1200);
  await cands.nth(i).click({force:true}).catch(e=>{});
  await p.waitForTimeout(1000);
  console.log('click idx',i,'->',p.url());
}
// also service page produce chips
await p.goto('http://localhost:8930/#service/orders-api', { waitUntil:'networkidle' }); await p.waitForTimeout(1500);
await p.getByText('order:placed', {exact:false}).nth(1).click().catch(e=>console.log('no'));
await p.waitForTimeout(1000);
console.log('from service page produces chip ->', p.url());
await b.close();
