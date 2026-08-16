import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
console.log("=== TITLE ===", await page.title());
console.log("=== BODY TEXT ===");
console.log(await page.locator('body').innerText());
console.log("=== LINKS ===");
const links = await page.locator('a').all();
for (const l of links) {
  const t = (await l.innerText()).replace(/\n/g,' | ').slice(0,80);
  const h = await l.getAttribute('href');
  if (t.trim()) console.log(`[${t}] -> ${h}`);
}
console.log("=== BUTTONS ===");
for (const b of await page.locator('button').all()) {
  const t = (await b.innerText()).replace(/\n/g,' ').slice(0,80);
  if (t.trim()) console.log(`(btn) ${t}`);
}
await page.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/01-front.png', fullPage: true });
await browser.close();
