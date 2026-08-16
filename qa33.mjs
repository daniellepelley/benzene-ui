import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const url of ['http://localhost:8930/#test/payments-api/payment%3Acapture','http://localhost:8930/#test/orders-api/order%3Aplaced','http://localhost:8930/#compose/payment%3Acapture']) {
  const ctx = await browser.newContext({viewport:{width:1440,height:1200}});
  const p = await ctx.newPage();
  await p.goto(url,{waitUntil:'networkidle'}); await p.waitForTimeout(5000);
  const tas = await p.locator('textarea').evaluateAll(x=>x.map(y=>y.value));
  const sels = await p.locator('select').evaluateAll(x=>x.map(y=>y.value));
  console.log(url.split('#')[1]);
  console.log('   selects='+JSON.stringify(sels)+'  textareas='+JSON.stringify(tas));
  await ctx.close();
}
await browser.close();
