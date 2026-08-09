#!/usr/bin/env node
/**
 * Generates TypeScript types for the mesh artifacts the UI consumes.
 *
 * IMPORTANT — what this can and cannot do. The specification's conformance fixtures are *test cases*
 * (steps, expected envelopes), not JSON Schema, so there is nothing to compile a type from directly.
 * These types are therefore inferred from real sample artifacts vendored in `contracts/artifacts/`,
 * which means they are a FLOOR, not a ceiling: a field absent from every sample cannot be inferred,
 * and a field that is null in every sample infers as null-only.
 *
 * That is a deliberate, honest limitation. It still buys the thing that matters — when the aggregator
 * changes an artifact's shape and the samples are re-vendored, the diff on the generated file is the
 * contract change, and any UI code relying on the old shape stops compiling.
 *
 * Run: npm run generate:contracts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'contracts', 'artifacts');

/** Structural description merged across N samples: optional if missing anywhere, nullable if ever null. */
function describe(value) {
  if (value === null) return { kind: 'null' };
  if (Array.isArray(value)) {
    const items = value.map(describe).reduce(merge, null);
    return { kind: 'array', items: items ?? { kind: 'unknown' } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = { ...describe(v), required: true };
    return { kind: 'object', fields };
  }
  return { kind: typeof value };
}

function merge(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.kind === 'null') return { ...b, nullable: true };
  if (b.kind === 'null') return { ...a, nullable: true };
  if (a.kind === 'object' && b.kind === 'object') {
    const fields = {};
    for (const key of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])) {
      const fa = a.fields[key];
      const fb = b.fields[key];
      if (fa && fb) fields[key] = { ...merge(fa, fb), required: true };
      else fields[key] = { ...(fa ?? fb), required: false };
    }
    return { kind: 'object', fields, nullable: a.nullable || b.nullable };
  }
  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', items: merge(a.items, b.items), nullable: a.nullable || b.nullable };
  }
  if (a.kind !== b.kind) return { kind: 'unknown', nullable: a.nullable || b.nullable };
  return { ...a, nullable: a.nullable || b.nullable };
}

const TS = { string: 'string', number: 'number', boolean: 'boolean', null: 'null', unknown: 'unknown' };

function render(node, name, out, indent = '  ') {
  if (node.kind === 'object') {
    const lines = [];
    for (const [key, field] of Object.entries(node.fields)) {
      const optional = field.required ? '' : '?';
      lines.push(`${indent}${key}${optional}: ${typeOf(field, name + cap(key), out)};`);
    }
    return `{\n${lines.join('\n')}\n}`;
  }
  return typeOf(node, name, out);
}

function typeOf(node, name, out) {
  let base;
  if (node.kind === 'array') base = `${typeOf(node.items, name + 'Item', out)}[]`;
  else if (node.kind === 'object') {
    const iface = cap(name);
    if (!out.has(iface)) {
      out.set(iface, null); // reserve, so nested self-references do not recurse forever
      out.set(iface, `export interface ${iface} ${render(node, iface, out)}\n`);
    }
    base = iface;
  } else base = TS[node.kind] ?? 'unknown';
  return node.nullable && node.kind !== 'null' ? `${base} | null` : base;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Every `<stem>*.json` in contracts/artifacts is a sample of the same artifact, merged together —
 * so widening a type is done by adding a sample that exercises the case, never by editing the
 * generated file. `manifest.json` plus `manifest.minimal.json` is how an optional field is declared.
 */
function loadSamples(stem) {
  const files = readdirSync(artifacts).filter(
    (f) => f === `${stem}.json` || (f.startsWith(`${stem}.`) && f.endsWith('.json')),
  );
  if (files.length === 0) return null;
  return files.map((f) => describe(JSON.parse(readFileSync(join(artifacts, f), 'utf8')))).reduce(merge, null);
}

const out = new Map();
const roots = [];

for (const [stem, typeName] of [
  ['manifest', 'Manifest'],
  ['topology', 'Topology'],
  ['usage', 'Usage'],
  ['topics', 'Topics'],
  ['annotations', 'Annotations'],
]) {
  const node = loadSamples(stem);
  if (!node) continue;
  typeOf(node, typeName, out);
  roots.push(typeName);
}

// Every service snapshot merged, so a field present in one sample and absent in another is optional.
const dir = join(artifacts, 'services');
if (existsSync(dir)) {
  const merged = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => describe(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
    .reduce(merge, null);
  if (merged) {
    typeOf(merged, 'ServiceSnapshot', out);
    roots.push('ServiceSnapshot');
  }
}

const specVersion = readFileSync(join(root, 'contracts', 'SPEC_VERSION'), 'utf8').trim();

const header = `/**
 * GENERATED FILE — do not edit by hand. Run \`npm run generate:contracts\`.
 *
 * Inferred from the sample artifacts in \`contracts/artifacts/\`, vendored from the specification
 * repo at commit ${specVersion}.
 *
 * These types are a FLOOR, not a ceiling. The spec's conformance fixtures are test cases rather than
 * JSON Schema, so a field no sample exercises cannot be inferred, and a field that is null in every
 * sample infers as null-only. Widen by adding a sample, not by editing this file — otherwise the next
 * generation silently reverts it.
 *
 * Generated roots: ${roots.join(', ')}
 */

`;

writeFileSync(
  join(root, 'src', 'contracts', 'generated.ts'),
  header + [...out.values()].filter(Boolean).join('\n'),
  'utf8',
);

console.log(`generated ${out.size} interfaces from ${roots.length} artifact roots → src/contracts/generated.ts`);
