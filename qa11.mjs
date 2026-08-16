import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.on('pageerror', e => console.log('PAGE ERR: '+e.message));
let reqs=[];
page.on('request', r => { if (r.method()!=='GET' && r.postData()?.includes('dispatch')) reqs.push(r.postData()); });
async function trial(label, version, body, headers) {
  reqs=[];
  await page.goto('http://localhost:8930/#compose/payment%3Acapture', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  if (version) { await page.locator('select').nth(1).selectOption(version); await page.waitForTimeout(500); }
  if (headers !== undefined) await page.locator('textarea').nth(0).fill(headers);
  if (body !== undefined) await page.locator('textarea').nth(1).fill(body);
  await page.waitForTimeout(400);
  const cb = page.locator('input[type=checkbox]');
  const disabledBefore = await page.getByRole('button', { name: /^Send/ }).isDisabled();
  await cb.check().catch(e=>console.log('  checkbox blocked: '+e.message.split('\n')[0]));
  await page.waitForTimeout(300);
  const disabled = await page.getByRole('button', { name: /^Send/ }).isDisabled();
  await page.getByRole('button', { name: /^Send/ }).click().catch(e=>console.log('  send click blocked'));
  await page.waitForTimeout(2500);
  const txt = await page.locator('body').innerText();
  const idx = txt.indexOf('RESPONSE');
  console.log('### '+label);
  console.log('  sendDisabled before tick='+disabledBefore+' after tick='+disabled);
  console.log('  WIRE: '+(reqs[0]||'(nothing sent)').slice(0,400));
  console.log('  UI RESULT: '+(idx>=0?txt.slice(idx, idx+600).replace(/\n+/g,' | '):'(no RESPONSE block) tail='+txt.slice(-400).replace(/\n+/g,' | ')));
}
await trial('A: v1 default payload', 'v1');
await trial('B: v2 missing required currency', 'v2', '{\n  "orderId": "00000000-0000-0000-0000-000000000000",\n  "amount": 0\n}');
await trial('C: v2 wrong type amount:"lots"', 'v2', '{"orderId":"00000000-0000-0000-0000-000000000000","amount":"lots","currency":"GBP"}');
await trial('D: v2 empty object', 'v2', '{}');
await trial('E: v2 malformed JSON', 'v2', '{"orderId": ');
await trial('F: v2 bad enum currency:"XYZ"', 'v2', '{"orderId":"00000000-0000-0000-0000-000000000000","amount":1,"currency":"XYZ"}');
await trial('G: header version v9 (nonexistent)', 'v2', undefined, '{"benzene-version":"v9"}');
await trial('H: empty body string', 'v2', '');
await browser.close();
