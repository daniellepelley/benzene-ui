import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1600} });
await p.goto('http://localhost:8930/#topic/payment%3Acapture@v1', { waitUntil:'networkidle' }); await p.waitForTimeout(1200);
await p.getByRole('button',{name:'compose a message'}).click(); await p.waitForTimeout(1500);
console.log('from v1 -> url='+p.url()+' headers='+JSON.stringify(await p.locator('textarea').nth(0).inputValue()));
// back button from compose
await p.goBack(); await p.waitForTimeout(1200);
console.log('back -> '+p.url());
// now send from test console and look for evidence
const p2 = await browser.newPage({ viewport:{width:1440,height:1600} });
await p2.goto('http://localhost:8930/#test/payments-api/payment%3Acapture', { waitUntil:'networkidle' }); await p2.waitForTimeout(1300);
await p2.locator('textarea').nth(1).fill('{"orderId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","amount":4242}');
await p2.locator('input[type=checkbox]').check();
await p2.getByRole('button',{name:/^Send/}).click(); await p2.waitForTimeout(3000);
const t=await p2.locator('body').innerText(); console.log('RESPONSE: '+t.slice(t.indexOf('RESPONSE')).replace(/\n+/g,' | '));
// look for evidence of that send
await p2.goto('http://localhost:8930/#topic/payment%3Acapture@v1', { waitUntil:'networkidle' }); await p2.waitForTimeout(2500);
const t2=await p2.locator('body').innerText();
console.log('AFTER-SEND TRAFFIC: '+t2.slice(t2.indexOf('TRAFFIC'), t2.indexOf('TRAFFIC')+400).replace(/\n+/g,' | '));
console.log('contains 4242? '+t2.includes('4242')+'  contains aaaaaaaa? '+t2.includes('aaaaaaaa'));
await browser.close();
