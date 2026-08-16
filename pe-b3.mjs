import { chromium } from 'playwright';
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1440,height:1400}});
await p.goto('http://localhost:8912/#fleet',{waitUntil:'networkidle'}); await p.waitForTimeout(2500);
console.log(await p.evaluate(()=>{
  const hdr = Array.from(document.querySelectorAll('thead th')).map(t=>t.innerText.trim()).join(' | ');
  const rows = Array.from(document.querySelectorAll('tbody tr')).map(tr=>{
    const c = Array.from(tr.querySelectorAll('td'));
    return c.map(td=>td.innerText.replace(/\s+/g,' ').trim()||'∅').join(' | ') + '   [statusTitle: ' + (c[5]?.querySelector('[title]')?.getAttribute('title') ?? '-') + ']';
  });
  return hdr + '\n' + rows.join('\n');
}));
await b.close();
