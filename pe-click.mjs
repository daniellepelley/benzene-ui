import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1400} });
await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' });
await p.waitForTimeout(1500);
// links in the topics table
const links = await p.locator('a[href*="#topic/"], [role=link]').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')||n.textContent));
console.log('TOPIC LINK HREFS:', JSON.stringify([...new Set(links)].slice(0,40)));
// click the order:placed v2 row
const rows = p.locator('tr');
const n = await rows.count();
for (let i=0;i<n;i++){
  const t = await rows.nth(i).innerText();
  if (t.includes('order:placed') && t.includes('v2')) { await rows.nth(i).click(); break; }
}
await p.waitForTimeout(1500);
console.log('AFTER CLICKING order:placed v2 ROW -> ', p.url());
const t = await p.locator('body').innerText();
const i2 = t.indexOf('TRAFFIC');
console.log((i2>=0?t.slice(i2,i2+400):'(none)').replace(/\n+/g,' | '));
// now go back and click the rollout card on the changes page
await p.goto('http://localhost:8930/#changes', { waitUntil:'networkidle' });
await p.waitForTimeout(1200);
const card = p.getByText('order:placed', { exact:false }).first();
await card.click().catch(e=>console.log('card not clickable'));
await p.waitForTimeout(1200);
console.log('AFTER CLICKING rollout card ->', p.url());
await b.close();
