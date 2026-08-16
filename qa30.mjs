import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1800} });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
async function t(label, headers, body) {
  await p.goto('http://localhost:8930/#test/payments-api/payment%3Acapture',{waitUntil:'networkidle'}); await p.waitForTimeout(1200);
  if(headers!==undefined) await p.locator('textarea').nth(0).fill(headers);
  if(body!==undefined) await p.locator('textarea').nth(1).fill(body);
  await p.waitForTimeout(500);
  await p.locator('input[type=checkbox]').check().catch(()=>{});
  await p.waitForTimeout(200);
  const dis=await p.getByRole('button',{name:/^Send/}).isDisabled().catch(()=>'no-btn');
  if(dis===false) await p.getByRole('button',{name:/^Send/}).click();
  await p.waitForTimeout(2200);
  const tx=await p.locator('body').innerText();
  const i=tx.indexOf('RESPONSE');
  console.log('### '+label+' sendDisabled='+dis+' | pagelen='+tx.length+' | '+(i>=0? tx.slice(i,i+200).replace(/\n+/g,' | ') : 'msg='+tx.slice(tx.indexOf('Body'),tx.indexOf('Body')+140).replace(/\n+/g,' | ')));
}
await t('headers = string', '"just a string"');
await t('headers = array', '[1,2,3]');
await t('headers malformed', '{oops');
await t('body = 50k orderId', undefined, '{"orderId":"'+ 'x'.repeat(50000) +'","amount":1}');
await t('body script+bignum', undefined, JSON.stringify({orderId:'<script>alert(1)</script>', amount:1e308}));
await t('body deeply nested', undefined, '{"a":'+'['.repeat(200)+']'.repeat(200)+'}');
console.log('ERRORS: '+(errs.join(' ; ')||'(none)'));
await browser.close();
