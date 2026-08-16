import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1400} });
const NEEDLE=[
 ['polled-instance','instance that answered the last poll'],
 ['scope','cannot see upcasters'],
 ['dagger','does not break it down by version'],
 ['disjoint','do not overlap at all'],
];
for (const r of ['fleet','changes','service/orders-api','service/payments-api','service/billing-api','topic/payment%3Acapture@v2','value']) {
  await p.goto('http://localhost:8930/#'+r, { waitUntil:'networkidle' });
  await p.waitForTimeout(1500);
  const t = await p.locator('body').innerText();
  console.log('#'+r+' :: '+NEEDLE.map(([k,n])=>k+'='+(t.includes(n)?'YES':'no ')).join('  '));
}
await b.close();
