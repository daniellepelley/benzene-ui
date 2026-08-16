import { chromium } from 'playwright';
const base='http://localhost:8912';
async function run(patch,label){
  const usage = await (await fetch(base+'/usage.json')).json();
  if(patch) usage.entries = usage.entries.map(e => e.topic==='payment:capture' ? {...e, version:'v1'} : e);
  const browser = await chromium.launch();
  const page = await browser.newPage({viewport:{width:1440,height:1600}});
  await page.route('**/usage.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify(usage)}));
  await page.goto(base+'/#fleet',{waitUntil:'networkidle'});
  await page.waitForTimeout(2000);
  const out = await page.evaluate(() => Array.from(document.querySelectorAll('tbody tr')).map(tr =>
    Array.from(tr.querySelectorAll('td')).map(td=>td.innerText.replace(/\s+/g,' ').trim()).join(' | ')));
  console.log('==== '+label); console.log(out.join('\n'));
  await browser.close();
}
await run(false,'usage version:null (as served)');
await run(true,'usage version:v1 for payment:capture');
