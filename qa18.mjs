import { chromium } from 'playwright';
const browser = await chromium.launch();
const routes = ['#test/payments-api/not%3Aatopic','#topic/not%3Aatopic','#topic/payment%3Acapture@v99','#service/nope','#compose/not%3Aatopic','#issue/deadbeef','#banana','#topic/','#compose/','#test//','#topic/payment%3Acapture@','#value','#changes'];
for (const r of routes) {
  const ctx = await browser.newContext({ viewport:{width:1280,height:900} });
  const p = await ctx.newPage(); const errs=[];
  p.on('pageerror', e=>errs.push(e.message));
  try { await p.goto('http://localhost:8930/'+r, { waitUntil:'networkidle' }); } catch(e){ errs.push('goto: '+e.message); }
  await p.waitForTimeout(1400);
  const t = (await p.locator('body').innerText()).replace(/\n+/g,' | ');
  const head = t.split('◐')[1] || t;
  console.log('### '+r+'  -> url='+p.url().split('/#')[1]);
  console.log('   len='+t.length+'  text: '+head.slice(0,300));
  if (errs.length) console.log('   ERRORS: '+errs.join(' ; '));
  await ctx.close();
}
await browser.close();
