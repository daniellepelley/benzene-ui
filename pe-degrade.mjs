import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const MODE='/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/pe-mode.txt';
const OUT='/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots';
const b = await chromium.launch();
const modes = process.argv.slice(2);
for (const spec of modes) {
  const [mode, route='fleet'] = spec.split('|');
  writeFileSync(MODE, mode);
  const p = await b.newPage({ viewport:{width:1440,height:1400} });
  const errs=[]; p.on('pageerror', e=>errs.push('PAGEERROR: '+e.message.split('\n')[0]));
  p.on('console', m=>{ if(m.type()==='error') errs.push('CONSOLE: '+m.text().slice(0,160)); });
  try {
    await p.goto('http://localhost:8931/#'+route, { waitUntil:'domcontentloaded', timeout:15000 });
    await p.waitForTimeout(3500);
  } catch(e) { console.log('NAV FAILED: '+e.message.split('\n')[0]); }
  const t = await p.locator('body').innerText().catch(()=>'(no body)');
  console.log('\n\n===== MODE '+mode+'  ROUTE #'+route+' =====');
  console.log(t.length===0 ? '!!!! BLANK PAGE (body innerText empty) !!!!' : t.slice(0,3000));
  await p.screenshot({ path: OUT+'/deg-'+mode+'-'+route.replace(/[\/:%@]/g,'_')+'.png', fullPage:true }).catch(()=>{});
  if (errs.length) console.log('-- errors: '+[...new Set(errs)].slice(0,4).join(' ;; '));
  await p.close();
}
writeFileSync(MODE,'normal');
await b.close();
