import { chromium } from 'playwright';
const browser = await chromium.launch();
async function t(label, fn){
  const page = await browser.newPage({viewport:{width:1440,height:1200}});
  let err=null; page.on('pageerror',e=>{if(!err)err=e.message.slice(0,80)});
  try { await fn(page); } catch(e){ console.log(label,'THREW',e.message.slice(0,60)); }
  await page.waitForTimeout(2000);
  const txt=(await page.locator('body').innerText()).trim();
  console.log(label+' -> url='+page.url()+' len='+txt.length+' err='+err);
  await page.close();
}
await t('A cold #service/orders-api', async p=>{ await p.goto('http://localhost:8920/#service/orders-api',{waitUntil:'networkidle'}); });
await t('B cold #fleet then click orders-api in catalogue', async p=>{ await p.goto('http://localhost:8920/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(2500); await p.locator('button',{hasText:/^orders-api$/}).first().click(); });
await t('C cold #fleet wait 6s then click', async p=>{ await p.goto('http://localhost:8920/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(6000); await p.locator('button',{hasText:/^orders-api$/}).first().click(); });
await t('D cold #changes then click orders-api', async p=>{ await p.goto('http://localhost:8920/#changes',{waitUntil:'networkidle'}); await p.waitForTimeout(2500); await p.getByRole('button',{name:'orders-api',exact:true}).first().click(); });
await t('E #changes->orders-api->Estate->click orders-api again', async p=>{ await p.goto('http://localhost:8920/#changes',{waitUntil:'networkidle'}); await p.waitForTimeout(2000); await p.getByRole('button',{name:'orders-api',exact:true}).first().click(); await p.waitForTimeout(2000); await p.getByText('Estate',{exact:true}).last().click(); await p.waitForTimeout(2000); await p.locator('button',{hasText:/^orders-api$/}).first().click(); });
await t('F cold #topic direct', async p=>{ await p.goto('http://localhost:8920/#topic/order%3Aplaced@v1',{waitUntil:'networkidle'}); });
await t('G #changes then click a topic name', async p=>{ await p.goto('http://localhost:8920/#changes',{waitUntil:'networkidle'}); await p.waitForTimeout(2000); await p.locator('button',{hasText:/^order:placed$/}).first().click().catch(async()=>{await p.getByText('order:placed').first().click();}); });
await browser.close();
