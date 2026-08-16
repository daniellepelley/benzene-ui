import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('request', r=>{ if(r.url().includes('/benzene/invoke')) console.log('REQ BODY', r.postData()); });
p.on('response', async r=>{ if(r.url().includes('/benzene/invoke')) { const t = await r.text(); console.log('RES', t.slice(0,3000)); } });
await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' });
await p.waitForTimeout(2500);
await b.close();
