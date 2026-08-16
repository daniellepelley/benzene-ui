import { chromium } from 'playwright';
const base = 'http://localhost:8912';
const topics = await (await fetch(base + '/topics.json')).json();
const usage  = await (await fetch(base + '/usage.json')).json();

// (a) notification:send v2 — declare that the response side could not be compared
const ns = topics.topics.find(t => t.topic === 'notification:send' && t.version === 'v2');
ns.compatibility.notComparedSides = ['response'];
// (b) inventory:reserve v2 — unrecognised notComparedReason
const inv = topics.topics.find(t => t.topic === 'inventory:reserve' && t.version === 'v2');
inv.compatibility = { baselineVersion: 'v1', overall: 'notCompared', changes: [], notComparedReason: 'somethingNew', truncatedPaths: [], notComparedSides: [] };
// (c) usage entries that DO carry a version, for payment:capture
usage.entries = usage.entries.map(e => e.topic === 'payment:capture' ? { ...e, version: 'v1' } : e);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.route('**/topics.json', r => r.fulfill({ contentType:'application/json', body: JSON.stringify(topics) }));
await page.route('**/usage.json',  r => r.fulfill({ contentType:'application/json', body: JSON.stringify(usage) }));
for (const rt of ['topic/notification:send@v2','topic/inventory:reserve@v2','topic/payment:capture@v2','value','fleet']) {
  await page.goto(base + '/#' + rt, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  await page.waitForTimeout(2000);
  const b = await page.locator('body').innerText();
  console.log('\n\n######## INJECTED #' + rt + ' ########');
  console.log(rt === 'fleet' ? b.slice(b.indexOf('TOPIC\t')) : b);
}
await browser.close();
