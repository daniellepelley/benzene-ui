import { chromium } from 'playwright';
const browser = await chromium.launch();
async function fresh() {
  const ctx = await browser.newContext({ viewport:{width:1440,height:1400} });
  const p = await ctx.newPage();
  const reqs=[]; p.on('request', r=>{ const d=r.postData(); if(d&&d.includes('dispatch')) reqs.push(d); });
  return {ctx,p,reqs};
}
for (const [label, body] of [['E malformed JSON','{"orderId": '],['H empty body','']]) {
  const {ctx,p,reqs} = await fresh();
  await p.goto('http://localhost:8930/#compose/payment%3Acapture', { waitUntil:'networkidle' });
  await p.waitForTimeout(1200);
  await p.locator('textarea').nth(1).fill(body);
  await p.waitForTimeout(600);
  const cbState = await p.locator('input[type=checkbox]').isDisabled().catch(()=>'n/a');
  await p.locator('input[type=checkbox]').check().catch(e=>console.log('  cb check err'));
  await p.waitForTimeout(300);
  const sendDis = await p.getByRole('button',{name:/^Send/}).isDisabled();
  const txt = await p.locator('body').innerText();
  console.log('### '+label+' | checkbox disabled='+cbState+' | send disabled='+sendDis);
  console.log('  screen tail: '+txt.split('Body')[1]?.replace(/\n+/g,' | ').slice(0,500));
  console.log('  wire: '+(reqs[0]||'(nothing sent)').slice(0,120));
  await ctx.close();
}
await browser.close();
