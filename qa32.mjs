import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({viewport:{width:1440,height:1200}});
await p.goto('http://localhost:8930/#test/payments-api/payment%3Acapture',{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
const read = async l => console.log(l+' -> '+JSON.stringify(await p.locator('textarea').evaluateAll(x=>x.map(y=>y.value))));
await read('initial');
await p.locator('textarea').nth(0).fill('{"benzene-version":"v1","x-test-run":"REL-42"}');
await p.waitForTimeout(800);
await read('after editing HEADERS only');
await p.locator('textarea').nth(1).fill('{"orderId":"11111111-1111-1111-1111-111111111111","amount":7}');
await p.waitForTimeout(800);
await read('after editing BODY');
// now change version select and see if my custom header survives
await p.locator('select').nth(3).selectOption('v2'); await p.waitForTimeout(900);
await read('after switching version to v2');
await browser.close();
