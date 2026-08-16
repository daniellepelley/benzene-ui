import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on('pageerror', e => console.log('PAGE ERR: '+e.message));
await page.goto('http://localhost:8930/#topic/payment%3Acapture@v2', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
// find version switcher controls
const ctrls = await page.evaluate(() => [...document.querySelectorAll('button,select,input')].map(e=>e.tagName+'|'+(e.className||'').toString().slice(0,35)+'|'+(e.innerText||e.value||'').replace(/\n/g,' ').slice(0,40)));
console.log(ctrls.join('\n'));
await browser.close();
