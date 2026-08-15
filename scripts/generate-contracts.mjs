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
  // An empty array yields `unknown` items. Merging that with a populated sample must keep the real
  // shape, not collapse to unknown — otherwise one topic with `producers: []` erases the producer
  // type inferred from every other topic, which is exactly what happened the first time.
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  if (a.kind === 'null') return { ...b, nullable: true };
  if (b.kind === 'null') return { ...a, nullable: true };
  if (a.kind === 'object' && b.kind === 'object') {
    const fields = {};
    for (const key of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])) {
      const fa = a.fields[key];
      const fb = b.fields[key];
      // Present on both sides is not the same as required on both sides. Two samples that each
      // saw the field as optional (some array items carry it, some don't) must stay optional —
      // forcing `required: true` here made `TopicsTopicsItem.changes` non-optional the moment a
      // second topics sample was added, which no aggregator output actually guarantees.
      if (fa && fb) fields[key] = { ...merge(fa, fb), required: fa.required !== false && fb.required !== false };
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

/**
 * Fields whose value is an open, recursive structure rather than a fixed shape. Inferring these
 * produces one interface per property of the sample payload — 40+ of them for a single JSON Schema,
 * all of which churn whenever a sample changes and none of which describe the contract. A JSON
 * Schema is a JSON Schema; it gets one hand-written recursive type.
 */
const OPAQUE = new Map([
  ['requestSchema', 'JsonSchema'],
  ['responseSchema', 'JsonSchema'],
  ['messageSchema', 'JsonSchema'],
  // A service spec is an OpenAPI document, so every payload shape in it is a JSON Schema. Inferring
  // them would mint one interface per property of whatever the sample happened to declare.
  ['request', 'JsonSchema'],
  ['response', 'JsonSchema'],
  ['message', 'JsonSchema'],
  ['components', 'SpecComponents'],
  // An example payload is, by definition, whatever the topic's schema says. There is no shape here.
  ['example', 'unknown'],
  // Keyed by whatever statuses were observed. Inferring it produces one interface per status the
  // sample happened to contain, which then churns on any traffic mix — and describes nothing.
  ['statusCounts', 'Record<string, number>'],
  // Free-form deployment placement (region, environment, cluster, …). The collector passes through
  // whatever the binding supplied; enumerating one sample's keys would claim a shape it does not have.
  ['placement', 'Record<string, string>'],
  // mesh.md §4.2: keyed by every declared provider/consumer service name for the topic, never a
  // fixed set. Inferring it from a sample would mint one interface field per service name the
  // sample happened to declare, which churns with the fleet instead of describing the contract.
  ['providerActivity', 'Record<string, EdgeActivity>'],
  ['consumerActivity', 'Record<string, EdgeActivity>'],
]);

function render(node, name, out, indent = '  ') {
  if (node.kind === 'object') {
    const lines = [];
    for (const [key, field] of Object.entries(node.fields)) {
      const optional = field.required ? '' : '?';
      const opaque = OPAQUE.get(key);
      const type = opaque
        ? `${opaque}${field.nullable ? ' | null' : ''}`
        : typeOf(field, name + cap(key), out);
      lines.push(`${indent}${key}${optional}: ${type};`);
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
  ['fleet', 'FleetView'],
  ['spec', 'ServiceSpec'],
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

const opaqueTypes = `/** The spec's schema bag, keyed by type name. Open, so it is declared, not inferred. */
export interface SpecComponents {
  schemas?: Record<string, JsonSchema>;
  [section: string]: unknown;
}

/** A JSON Schema document. Open and recursive by definition, so it is declared, not inferred. */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [keyword: string]: unknown;
}

/**
 * mesh.md §4.2: per declared provider/consumer, whether — and when — a trace has actually
 * exercised the edge. Absent \`lastObservedAt\` (an empty object) is the honest "never observed"
 * case, a decommission *candidate*, not a fact; it is never collapsed to a boolean.
 */
export interface EdgeActivity {
  lastObservedAt?: string;
}
`;

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
  header + opaqueTypes + '\n' + [...out.values()].filter(Boolean).join('\n'),
  'utf8',
);

console.log(`generated ${out.size} interfaces from ${roots.length} artifact roots → src/contracts/generated.ts`);
