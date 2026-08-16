import { chromium } from 'playwright';
const browser = await chromium.launch();
async function t(label, headers, body) {
  const ctx = await browser.newContext({viewport:{width:1440,height:1200}});
  const p = await ctx.newPage(); const errs=[]; const reqs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('request',r=>{const d=r.postData(); if(d&&d.includes('dispatch')) reqs.push(d);});
  await p.goto('http://localhost:8930/#test/payments-api/payment%3Acapture',{waitUntil:'networkidle'}); await p.waitForTimeout(1300);
  if(headers!==undefined) await p.locator('textarea').nth(0).fill(headers);
  if(body!==undefined) await p.locator('textarea').nth(1).fill(body);
  await p.waitForTimeout(700);
  await p.locator('input[type=checkbox]').check().catch(()=>{});
  await p.waitForTimeout(300);
  const dis=await p.getByRole('button',{name:/^Send/}).isDisabled().catch(()=>'no-btn');
  if(dis===false) await p.getByRole('button',{name:/^Send/}).click();
  await p.waitForTimeout(2500);
  const tx=await p.locator('body').innerText(); const i=tx.indexOf('RESPONSE');
  console.log('### '+label+' sendDisabled='+dis);
  console.log('   wire: '+(reqs[0]? reqs[0].slice(0,230):'(nothing sent)'));
  console.log('   ui  : '+(i>=0? tx.slice(i,i+200).replace(/\n+/g,' | ') : 'no response. tail='+tx.slice(-200).replace(/\n+/g,' | ')));
  if(errs.length) console.log('   PAGEERR: '+errs.join(';'));
  await ctx.close();
}
await t('headers = string', '"just a string"');
await t('headers = array', '[1,2,3]');
await t('body 50k orderId', undefined, '{"orderId":"'+ 'x'.repeat(50000) +'","amount":1}');
await t('body script tag', undefined, JSON.stringify({orderId:'<script>alert(1)</script>', amount:1e308}));
await t('body deep nest', undefined, '{"a":'+'['.repeat(200)+']'.repeat(200)+'}');
await browser.close();
