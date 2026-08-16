import { chromium } from 'playwright';
const browser = await chromium.launch();
async function trial(label, url, version, body) {
  const ctx = await browser.newContext({ viewport:{width:1440,height:1400} });
  const p = await ctx.newPage();
  const reqs=[]; p.on('request', r=>{const d=r.postData(); if(d&&d.includes('dispatch')) reqs.push(d);});
  p.on('pageerror', e=>console.log('  PAGE ERR '+e.message));
  await p.goto(url, { waitUntil:'networkidle' }); await p.waitForTimeout(1300);
  if (version) { await p.locator('select').nth(3).selectOption(version); await p.waitForTimeout(700); }
  if (body!==undefined) { await p.locator('textarea').nth(1).fill(body); await p.waitForTimeout(400); }
  await p.locator('input[type=checkbox]').check().catch(()=>{});
  await p.waitForTimeout(250);
  const dis = await p.getByRole('button',{name:/^Send/}).isDisabled();
  if (!dis) await p.getByRole('button',{name:/^Send/}).click();
  await p.waitForTimeout(2600);
  const t = await p.locator('body').innerText();
  const i = t.indexOf('RESPONSE');
  console.log('### '+label+' | sendDisabled='+dis);
  const w = reqs[0]||'(nothing sent)';
  console.log('  WIRE: '+w.slice(0,350));
  console.log('  UI: '+(i>=0? t.slice(i,i+500).replace(/\n+/g,' | ') : '(no response block)'));
  await ctx.close();
}
const U='http://localhost:8930/#test/payments-api/payment%3Acapture';
await trial('1 payments-api @v1 (declared handler)', U, 'v1');
await trial('2 payments-api @v2 (NO declared handler)', U, 'v2');
await trial('3 payments-api @v2 missing required currency', U, 'v2', '{"orderId":"00000000-0000-0000-0000-000000000000","amount":0}');
await trial('4 shipping-api / payment:capture? (service that never touches it)', 'http://localhost:8930/#test/shipping-api/payment%3Acapture', null);
await trial('5 nonexistent service in URL', 'http://localhost:8930/#test/does-not-exist/payment%3Acapture', null);
await trial('6 nonexistent topic in URL', 'http://localhost:8930/#test/payments-api/not%3Aatopic', null);
await browser.close();
