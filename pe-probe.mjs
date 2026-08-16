import { chromium } from 'playwright';
const OUT='/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errs=[]; page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()); });
page.on('pageerror', e=>errs.push('PAGEERROR '+e.message));
const routes = process.argv.slice(2);
for (const r of routes) {
  await page.goto('http://localhost:8930/#'+r, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  console.log('\n\n########## #'+r+' ##########');
  console.log(await page.locator('body').innerText());
  await page.screenshot({ path: OUT+'/'+r.replace(/[\/:]/g,'_')+'.png', fullPage: true });
}
if(errs.length) console.log('\n\n### CONSOLE ERRORS ###\n'+errs.join('\n'));
await browser.close();
