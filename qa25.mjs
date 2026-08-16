import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1800} });
p.on('pageerror',e=>console.log('PAGE ERR '+e.message));
await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' }); await p.waitForTimeout(1500);
// open the payment:capture issue
await p.getByText('Benzene.NoHandlerRegisteredException on payment:capture').first().click(); await p.waitForTimeout(2000);
console.log('ISSUE URL: '+p.url());
const t=await p.locator('body').innerText(); console.log(t.split('◐')[1]);
console.log('=== copy/export buttons anywhere? ===');
console.log((await p.evaluate(()=>[...document.querySelectorAll('button')].map(b=>b.innerText.replace(/\n/g,' ')))).filter(x=>/copy|export|download|share|link|json/i.test(x)).join(' | ') || '(none)');
await browser.close();
