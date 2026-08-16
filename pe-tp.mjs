import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1440,height:1400}});
for (const r of ['topic/payment:capture@v2','topic/orders:create@v1','topic/inventory:reserve@v1']) {
  await p.goto('http://localhost:8912/#'+r,{waitUntil:'networkidle'}); await p.waitForTimeout(2200);
  const sec = await p.evaluate(() => {
    const h = Array.from(document.querySelectorAll('h3,h2')).find(e=>/traffic/i.test(e.textContent));
    return h ? h.closest('section').innerText : 'NO TRAFFIC SECTION';
  });
  console.log('#### '+r+'\n'+sec+'\n');
}
await b.close();
