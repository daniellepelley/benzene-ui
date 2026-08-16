import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1600} });
p.on('pageerror',e=>console.log('PAGE ERR '+e.message));
// 1. does live window change anything?
await p.goto('http://localhost:8930/#topic/payment%3Acapture@v1', { waitUntil:'networkidle' }); await p.waitForTimeout(1500);
const grab = async () => { const t=await p.locator('body').innerText(); const i=t.indexOf('TRAFFIC'); return t.slice(i, i+420).replace(/\n+/g,' | '); };
console.log('WINDOW 15m: '+await grab());
await p.locator('select').first().selectOption('86400000'); await p.waitForTimeout(2500);
console.log('WINDOW 24h: '+await grab());
console.log('URL now: '+p.url());
await p.locator('select').first().selectOption('3600000'); await p.waitForTimeout(2500);
console.log('WINDOW 1h : '+await grab());
await browser.close();
