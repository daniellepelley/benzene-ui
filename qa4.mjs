import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
await page.goto('http://localhost:8930/#fleet', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const cands = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    const t = (el.innerText||'').trim();
    if (!t || t.length>40) return;
    const cs = getComputedStyle(el);
    if (cs.cursor === 'pointer' || el.tagName==='BUTTON' || el.tagName==='A' || el.getAttribute('role')==='button' || el.hasAttribute('onclick')) {
      out.push(el.tagName+'.'+(el.className && typeof el.className==='string' ? el.className.slice(0,40):'')+' | '+t.replace(/\n/g,' '));
    }
  });
  return [...new Set(out)];
});
console.log(cands.join('\n'));
await browser.close();
