import { chromium } from 'playwright';
const browser = await chromium.launch();
const p = await browser.newPage({ viewport:{width:1440,height:1400} });
p.on('pageerror', e=>console.log('PAGE ERR '+e.message));
async function pick(svc, topic) {
  await p.goto('http://localhost:8930/#test', { waitUntil:'networkidle' });
  await p.waitForTimeout(900);
  await p.locator('select').nth(1).selectOption(svc); await p.waitForTimeout(800);
  await p.locator('select').nth(2).selectOption(topic); await p.waitForTimeout(1200);
  console.log('##### '+svc+' / '+topic+'  URL='+p.url());
  const t = await p.locator('body').innerText();
  console.log(t.split('Topic')[1] || t);
  const tas = await p.locator('textarea').evaluateAll(x=>x.map(y=>y.value));
  console.log('  TEXTAREAS: '+JSON.stringify(tas));
}
await pick('payments-api','payment:capture');
await pick('payments-api','shipping:book');
await browser.close();
