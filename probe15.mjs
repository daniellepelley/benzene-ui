import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });
await page.goto('http://localhost:8930/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const btns = await page.getByRole('button', { name: 'show', exact: true }).all();
await btns[btns.length-1].click();
await page.waitForTimeout(2500);
const el = page.locator('svg').last();
await el.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await el.screenshot({ path: '/tmp/claude-0/-home-user-Benzene/77b3f3e3-e32a-52a7-bd95-4e3fccac2f7b/scratchpad/shots/16-topo-svg.png' });
// dump svg text nodes
console.log(await el.innerText());
const html = await el.innerHTML();
console.log("SVG len", html.length);
console.log(html.replace(/></g,'>\n<').split('\n').filter(l=>/title|text|<g |class=/.test(l)).slice(0,120).join('\n'));
await browser.close();
