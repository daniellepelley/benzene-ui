#!/usr/bin/env node
/**
 * Imports the built package the way a consumer would, and renders with it.
 *
 * Checking that files exist is not the same as checking they work: a lib build can emit a valid
 * `index.js` that throws on import, or that renders nothing because the CSS never arrives, or that
 * carries its own React. This does what the README tells a team to do — import the components,
 * build a store, render — and fails loudly if any of it is a lie.
 *
 * Run: npm run test:package (which builds first).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
};
const pass = (message) => console.log(`✓ ${message}`);

const lib = await import(join(root, 'dist', 'lib', 'index.js'));

// 1. The exports the README promises.
for (const name of ['ServiceCard', 'StatusGlyph', 'ragForStatus', 'createStore', 'TopicList', 'EmptyState']) {
  if (typeof lib[name] !== 'function') fail(`${name} is not exported as a function`);
}
pass('the documented exports are present and callable');

// 2. A component renders from props alone, with no store in sight — the reuse claim in one line.
const card = renderToStaticMarkup(
  createElement(lib.ServiceCard, {
    service: { name: 'orders-api', status: 'healthy', contractDrift: false },
    rag: lib.ragForStatus('healthy'),
    expanded: false,
    onToggle: () => {},
    onOpen: () => {},
  }),
);
if (!card.includes('orders-api')) fail('ServiceCard rendered without its service name');
if (!card.includes('bz-svc')) fail('ServiceCard rendered without its theme class names');
pass('a component renders standalone, from props only');

// 3. The store builds, and a container renders through it.
const store = lib.createStore({
  getManifest: async () => ({ generatedAtUtc: '2026-08-09T06:00:00Z', services: [] }),
  getService: async () => ({}),
  getTopics: async () => ({ generatedAtUtc: '', topics: [], removedTopics: [] }),
  getTopology: async () => ({ generatedAtUtc: '', edges: [] }),
  getUsage: async () => ({ generatedAtUtc: '', windowStartUtc: '', windowEndUtc: '', entries: [] }),
});
const state = store.getState();
for (const slice of ['estate', 'view', 'fleet', 'catalog', 'annotations', 'compose', 'capabilities']) {
  if (!(slice in state)) fail(`the store is missing its ${slice} slice`);
}
// No collector and no annotation endpoint were supplied, so both capabilities must be false —
// proof the capability derivation survived the build rather than defaulting to permissive.
if (state.capabilities.fleet !== false || state.capabilities.annotate !== false) {
  fail('capabilities did not derive from the injected API');
}
pass('the store builds and derives its capabilities');

const list = renderToStaticMarkup(
  createElement(Provider, { store }, createElement(lib.ServiceList, {})),
);
if (!list.includes('No services match this filter')) fail('ServiceList did not render its empty state');
pass('a container renders through the store');

// 4. The stylesheet is real, and is the one the components' class names need.
const css = readFileSync(join(root, 'dist', 'lib', 'theme.css'), 'utf8');
for (const rule of ['--bz-bg', '.bz-svc', 'body']) {
  if (!css.includes(rule)) fail(`theme.css is missing ${rule}`);
}
pass('theme.css ships the tokens, the base layer and the component rules');

if (process.exitCode) {
  console.error('\nThe published package does not work as documented.');
} else {
  console.log('\nThe package imports, renders and themes as documented.');
}
