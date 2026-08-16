import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('request', async r => { if (r.url().includes('/benzene/invoke')) console.log('REQ >>', r.postData()); });
page.on('response', async r => { if (r.url().includes('/benzene/invoke')) { try { console.log('RES <<', (await r.text()).slice(0,2600)); } catch {} } });
await page.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'});
await page.waitForTimeout(4000);
await browser.close();
