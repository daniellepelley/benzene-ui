import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
p.on('request', r=>console.log('REQ', r.method(), r.url()));
p.on('response', r=>console.log('RES', r.status(), r.url()));
await p.goto('http://localhost:8930/#fleet', { waitUntil:'networkidle' });
await p.waitForTimeout(2000);
await b.close();
