#!/usr/bin/env node
/**
 * Renders the built pages against the demo fixtures and writes PNGs.
 *
 * This exists because of a bug that shipped: the stylesheet had no `html`/`body` rule, so the
 * product was a dark box on a white page in Times New Roman — and every test passed, because every
 * test asserted on text content and the text was fine. Automated tests cannot tell you a page looks
 * wrong. A person looking at it can, in about a second, and this makes that cheap enough to do on
 * every change.
 *
 * Not a visual-regression test: no baselines, no diffing, nothing to fail. Deliberately — a
 * screenshot diff on a page under active design churns constantly and gets ignored, which is worse
 * than no check at all. This is a contact sheet for a human.
 *
 * Usage: npm run shots [-- --scheme dark] [-- --out some/dir]
 * Requires: npm run build, and a fixtures directory (defaults to the vendored website demo).
 */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};

const outDir = join(root, arg('out', 'screenshots'));
const scheme = arg('scheme', 'light');
// The vendored contract samples double as fixtures: same artifacts, same shapes, already in this
// repo. So `npm run shots` works from a bare checkout with no sibling repository to find.
const fixtures = arg('fixtures', join(root, 'contracts', 'artifacts'));

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('No dist/index.html — run `npm run build` first.');
  process.exit(1);
}
if (!existsSync(fixtures)) {
  console.error(`No fixtures at ${fixtures} — pass --fixtures <dir>.`);
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.js': 'text/javascript' };

/** Serves the freshly built pages over the fixture directory, so the shots are of THIS build. */
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const candidates =
    path === 'index.html'
      ? [join(root, 'dist', 'index.html')]
      : path === 'mesh-spec-ui.html'
        ? [join(root, 'dist', 'spec', 'spec.html')]
        : [join(fixtures, path)];
  for (const file of candidates) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'text/plain' });
      return res.end(body);
    } catch {
      /* try the next candidate */
    }
  }
  res.writeHead(404);
  res.end('not found');
});

await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const PAGES = [
  { name: 'estate', path: '/' },
  { name: 'estate-expanded', path: '/', click: '.bz-svc button[aria-expanded]' },
  { name: 'service', path: '/#service/payments-api' },
  { name: 'topic', path: '/#topic/payment%3Acapture' },
  { name: 'value', path: '/#value' },
  { name: 'spec', path: '/mesh-spec-ui.html?service=orders-api&mesh=/', click: '.bz-op-head' },
  // Dark declared through `data-theme` rather than the OS. It is a second copy of the dark token
  // block, so it is the one that can silently drift into a half-dark page; the run above with
  // `--scheme dark` never exercises it.
  { name: 'forced-dark', path: '/', click: ['.bz-theme-toggle', '.bz-theme-toggle'] },
];

const browser = await chromium.launch();
const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('response', (r) => {
  // /favicon.ico is the browser asking unprompted; every other 4xx is ours.
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) problems.push(`HTTP ${r.status()} ${r.url()}`);
});

await mkdir(outDir, { recursive: true });
const index = [];

for (const { name, path, click } of PAGES) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  for (const selector of [click].flat().filter(Boolean)) {
    const target = page.locator(selector).first();
    if (await target.count()) {
      await target.click();
      await page.waitForTimeout(250);
    }
  }
  const file = join(outDir, `${name}-${scheme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  index.push(`${name}-${scheme}.png`);
  console.log(`  ${name}`);
}

// A contact sheet, so all of them can be looked at at once rather than one file at a time.
await writeFile(
  join(outDir, `index-${scheme}.html`),
  `<!doctype html><meta charset="utf-8"><title>Benzene UI — ${scheme}</title>` +
    `<body style="margin:0;background:#222;color:#eee;font:14px system-ui">` +
    index
      .map((f) => `<figure style="margin:0 0 2rem"><figcaption style="padding:.5rem">${f}</figcaption>` +
        `<img src="${f}" style="max-width:100%;display:block"></figure>`)
      .join('') +
    `</body>`,
  'utf8',
);

await browser.close();
server.close();

console.log(`\n${index.length} shots → ${outDir}/index-${scheme}.html`);
if (problems.length) {
  console.log('\nProblems while rendering:');
  for (const p of [...new Set(problems)]) console.log(`  ${p}`);
  process.exitCode = 1;
}
