import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:1440,height:1400} });
const grab = async (tag) => {
  const t = await p.locator('body').innerText();
  const i = t.indexOf('TRAFFIC'); const j = t.indexOf('FLOWS');
  console.log('--- '+tag+' | url='+p.url());
  console.log((i>=0? t.slice(i, j>i?j:i+700) : '(no TRAFFIC)').replace(/\n+/g,' | '));
};
for (const topic of ['inventory%3Areserve','order%3Aplaced','invoice%3Araise']) {
  await p.goto('http://localhost:8930/#topic/'+topic, { waitUntil:'networkidle' });
  await p.waitForTimeout(1500);
  await grab(topic+' [as landed, no version clicked]');
  for (const v of ['v1','v2']) {
    await p.getByRole('button', { name: v, exact:true }).first().click().catch(async e=>{ await p.getByText(v,{exact:true}).first().click(); });
    await p.waitForTimeout(1200);
    await grab(topic+' [clicked '+v+']');
  }
}
await b.close();
