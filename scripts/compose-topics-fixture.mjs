#!/usr/bin/env node
/**
 * Regenerates `contracts/artifacts/topics.json` — the sample estate the UI's types are inferred from
 * and the estate a developer sees when they run the UI with no collector wired.
 *
 * WHY THIS IS A SCRIPT AND NOT HAND-WRITTEN JSON
 * ---------------------------------------------
 * Every `compatibility` block below has to agree with the `requestSchema` / `responseSchema` /
 * `messageSchema` sitting beside it — same fields, same paths, same verdicts, same traversal order —
 * or the fixture teaches the UI to render a shape the real aggregator never emits. Two rounds of
 * persona testing were distorted by fixtures that quietly disagreed with the product, so the change
 * lists here are *derived from the schemas*, by a walker that mirrors
 * `Benzene.Schema.Compatibility/JsonSchemaComparer` step for step, rather than typed out.
 *
 * This walker is FIXTURE-GENERATION ONLY. It is not a second implementation in the product: nothing
 * ships it, nothing imports it at runtime, and the rule table it encodes is a copy of
 * `SchemaCompatibilityRules.DefaultFor` that exists so the sample data is self-consistent. The
 * authority remains the .NET (and, in time, TypeScript) aggregator. If the two ever disagree, the
 * aggregator is right and this file is the bug.
 *
 * THE ESTATE IS DESIGNED, NOT ARBITRARY. It carries one topic per verdict class, because a fixture
 * that only shows `breaking` lets `warning`, `compatible` and — most importantly — `notCompared`
 * ship unrendered and untested:
 *
 *   orders:create      request   BREAKING     required field renamed + a new required field
 *   orders:get-all     response  BREAKING     a field the client reads was deleted
 *   payment:capture    message   BREAKING     integer -> number on money, and the walk stops there
 *   shipping:book      message   BREAKING     an event field deleted (consumer-side removal)
 *   inventory:reserve  request   WARNING      an optional request field the service now ignores
 *   notification:send  request   COMPATIBLE   an optional field added
 *   order:legacy-export     -     NOT COMPARED one version published, so there is no pair
 *
 * Preserved deliberately from earlier rounds because they are confirmed product findings that must
 * keep reproducing: `order:legacy-export` has no usage rows (the Value page turns that absence into
 * a deletion case), and `orders:create` has no in-estate producer — the shape of every HTTP-fronted
 * topic, and the case that makes `versionCompatibility.isCompatible` vacuously true.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const artifacts = join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'artifacts');

// ── schema helpers ───────────────────────────────────────────────────────────────────────────────
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const str = (extra = {}) => ({ type: 'string', ...extra });
const num = () => ({ type: 'number' });
const int = () => ({ type: 'integer' });
const bool = () => ({ type: 'boolean' });

// ── the walker: a faithful mirror of JsonSchemaComparer, for fixture generation only ─────────────
const RULES = {
  // kind -> [Request, Response, Event]. Copied from SchemaCompatibilityRules.DefaultFor.
  propertyAdded: ['compatible', 'compatible', 'compatible'],
  requiredPropertyAdded: ['breaking', 'compatible', 'compatible'],
  propertyRemoved: ['warning', 'breaking', 'breaking'],
  propertyBecameRequired: ['breaking', 'compatible', 'compatible'],
  propertyBecameOptional: ['compatible', 'warning', 'warning'],
  typeChanged: ['breaking', 'breaking', 'breaking'],
};

const DIRECTION_INDEX = { request: 0, response: 1, event: 2 };

const verdict = (kind, direction) => RULES[kind][DIRECTION_INDEX[direction]];

const describe = (schema) => (schema.format ? `${schema.type}/${schema.format}` : (schema.type ?? 'object'));

function walk(baseline, current, direction, topic, path, changes, depth = 0) {
  if (!baseline || !current || depth > 32) return;

  if (baseline.type !== current.type || baseline.format !== current.format) {
    changes.push(change('typeChanged', direction, path,
      `Type changed from '${describe(baseline)}' to '${describe(current)}'`));
    return; // fundamentally different types — no point diffing their members
  }

  const before = baseline.properties ?? {};
  const after = current.properties ?? {};
  const wasRequired = new Set(baseline.required ?? []);
  const isRequired = new Set(current.required ?? []);

  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      changes.push(change('propertyRemoved', direction, `${path}.${name}`, `Property '${name}' was removed`));
    }
  }

  for (const name of Object.keys(after)) {
    if (!(name in before)) {
      const required = isRequired.has(name);
      changes.push(change(required ? 'requiredPropertyAdded' : 'propertyAdded', direction, `${path}.${name}`,
        `Property '${name}' was added${required ? ' (required)' : ''}`));
    }
  }

  for (const name of Object.keys(before)) {
    if (!(name in after)) continue;
    if (!wasRequired.has(name) && isRequired.has(name)) {
      changes.push(change('propertyBecameRequired', direction, `${path}.${name}`, `Property '${name}' became required`));
    } else if (wasRequired.has(name) && !isRequired.has(name)) {
      changes.push(change('propertyBecameOptional', direction, `${path}.${name}`, `Property '${name}' became optional`));
    }
    walk(before[name], after[name], direction, topic, `${path}.${name}`, changes, depth + 1);
  }

  if (baseline.items && current.items) {
    walk(baseline.items, current.items, direction, topic, `${path}[]`, changes, depth + 1);
  }
}

const change = (kind, direction, path, description) =>
  ({ kind, direction, path, description, compatibility: verdict(kind, direction) });

/** Mirrors MeshAggregator.CompareVersions: per side, then roll up to the worst verdict. */
function compare(topic, baseline, current) {
  const changes = [];
  const notComparedSides = [];
  let compared = 0;

  for (const [side, direction, key] of [
    ['request', 'request', 'requestSchema'],
    ['response', 'response', 'responseSchema'],
    ['message', 'event', 'messageSchema'],
  ]) {
    const before = baseline[key];
    const after = current[key];
    if (!before && !after) continue;
    if (!before || !after) { notComparedSides.push(side); continue; }
    compared++;
    walk(before, after, direction, topic, `${topic}.${side}`, changes);
  }

  if (compared === 0) {
    return {
      baselineVersion: baseline.version,
      overall: 'notCompared',
      changes: [],
      notComparedReason: 'noSchemaPublished',
      truncatedPaths: [],
      notComparedSides,
    };
  }

  const overall = changes.some((c) => c.compatibility === 'breaking') ? 'breaking'
    : changes.some((c) => c.compatibility === 'warning') ? 'warning'
      : 'compatible';

  return {
    baselineVersion: baseline.version,
    overall,
    changes,
    notComparedReason: null,
    truncatedPaths: changes.filter((c) => c.kind === 'typeChanged').map((c) => c.path),
    notComparedSides,
  };
}

// ── the estate ───────────────────────────────────────────────────────────────────────────────────
const lines = {
  type: 'array',
  items: obj({ sku: str({ pattern: '^[A-Z]{3}-[0-9]{4}$' }), quantity: int() }, ['sku']),
};

const ordersApi = { service: 'orders-api' };
const paymentsApi = { service: 'payments-api' };
const shippingApi = { service: 'shipping-api' };

const topics = [
  // BREAKING (request): a required field renamed, and a new required field. No in-estate producer —
  // the callers are a website or an app, which is what makes the topology verdict vacuously true.
  {
    topic: 'orders:create', version: 'v1', reserved: false,
    consumers: [{ ...ordersApi, httpMappings: [{ method: 'POST', path: '/orders' }] }], producers: [],
    status: null, schemaMismatch: false, changes: [],
    requestSchema: obj({ customerId: str({ format: 'uuid' }), lines }, ['customerId', 'lines']),
    responseSchema: obj({ orderId: str({ format: 'uuid' }), accepted: bool() }, ['orderId']),
  },
  {
    topic: 'orders:create', version: 'v2', reserved: false,
    consumers: [{ ...ordersApi, httpMappings: [{ method: 'POST', path: '/orders' }] }], producers: [],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (request)' }],
    requestSchema: obj({ customerRef: str({ format: 'uuid' }), lines, channel: str({ enum: ['web', 'mobile', 'partner'] }) },
      ['customerRef', 'lines', 'channel']),
    responseSchema: obj({ orderId: str({ format: 'uuid' }), accepted: bool() }, ['orderId']),
  },

  // BREAKING (response): a field the client reads was deleted.
  {
    topic: 'orders:get-all', version: 'v1', reserved: false,
    consumers: [{ ...ordersApi, httpMappings: [{ method: 'GET', path: '/orders' }] }], producers: [],
    status: null, schemaMismatch: false, changes: [],
    requestSchema: obj({}, []),
    responseSchema: obj({
      id: str({ format: 'uuid' }), customerEmail: str({ format: 'email' }), total: num(),
      status: str({ enum: ['pending', 'paid', 'shipped'] }),
    }, ['id', 'status']),
  },
  {
    topic: 'orders:get-all', version: 'v2', reserved: false,
    consumers: [{ ...ordersApi, httpMappings: [{ method: 'GET', path: '/orders' }] }], producers: [],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (response)' }],
    requestSchema: obj({}, []),
    responseSchema: obj({
      id: str({ format: 'uuid' }), customerEmail: str({ format: 'email' }),
      status: str({ enum: ['pending', 'paid', 'shipped'] }),
    }, ['id', 'status']),
  },

  // BREAKING (message): integer -> number on a money field, which also STOPS THE WALK at that node —
  // the case the UI has to mark, or its change count is a floor presented as a total.
  {
    topic: 'payment:capture', version: 'v1', reserved: false,
    consumers: [{ ...paymentsApi, httpMappings: [{ method: 'POST', path: '/payments/capture' }] }],
    producers: [ordersApi], status: null, schemaMismatch: false, changes: [],
    messageSchema: obj({ orderId: str({ format: 'uuid' }), amount: int() }, []),
  },
  {
    topic: 'payment:capture', version: 'v2', reserved: false,
    consumers: [], producers: [ordersApi], status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (message)' }],
    messageSchema: obj({
      orderId: str({ format: 'uuid' }), amount: num(), currency: str({ enum: ['GBP', 'EUR', 'USD'] }),
    }, ['orderId']),
  },

  // BREAKING (message): a field deleted from an event. The consumer may read it, so unlike the
  // request-side removal below this is breaking rather than a warning — the asymmetry made concrete.
  {
    topic: 'shipping:book', version: 'v1', reserved: false,
    consumers: [shippingApi], producers: [ordersApi, paymentsApi], status: null, schemaMismatch: false, changes: [],
    messageSchema: obj({
      orderId: str({ format: 'uuid' }),
      address: obj({ line1: str({ maxLength: 120 }), line2: str({ maxLength: 120 }), postcode: str({ maxLength: 12 }) },
        ['line1', 'postcode']),
    }, ['orderId', 'address']),
  },
  {
    topic: 'shipping:book', version: 'v2', reserved: false,
    consumers: [shippingApi], producers: [ordersApi, paymentsApi], status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (message)' }],
    messageSchema: obj({
      orderId: str({ format: 'uuid' }),
      address: obj({ line1: str({ maxLength: 120 }), postcode: str({ maxLength: 12 }) }, ['line1', 'postcode']),
    }, ['orderId', 'address']),
  },

  // WARNING (request): an optional field the service will now ignore. Structurally safe, and still
  // worth a reader's attention — which is exactly what a warning is for.
  {
    topic: 'inventory:reserve', version: 'v1', reserved: false,
    consumers: [{ ...shippingApi, httpMappings: [{ method: 'POST', path: '/inventory/reserve' }] }],
    producers: [ordersApi], status: null, schemaMismatch: false, changes: [],
    requestSchema: obj({ sku: str(), quantity: int(), warehouseHint: str() }, ['sku', 'quantity']),
  },
  {
    topic: 'inventory:reserve', version: 'v2', reserved: false,
    consumers: [{ ...shippingApi, httpMappings: [{ method: 'POST', path: '/inventory/reserve' }] }],
    producers: [ordersApi], status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (request)' }],
    requestSchema: obj({ sku: str(), quantity: int() }, ['sku', 'quantity']),
  },

  // COMPATIBLE: an optional field added. The estate needs one of these or the UI's "compatible"
  // rendering ships untested — and a product that only ever shows alarms teaches people to ignore it.
  {
    topic: 'notification:send', version: 'v1', reserved: false,
    consumers: [paymentsApi], producers: [ordersApi], status: null, schemaMismatch: false, changes: [],
    requestSchema: obj({ recipient: str({ format: 'email' }), template: str() }, ['recipient', 'template']),
  },
  {
    topic: 'notification:send', version: 'v2', reserved: false,
    consumers: [paymentsApi], producers: [ordersApi], status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (request)' }],
    requestSchema: obj({ recipient: str({ format: 'email' }), template: str(), locale: str() },
      ['recipient', 'template']),
  },

  // NOT COMPARED: one version published. Must never render as "compatible" — the whole third state
  // exists for this row.
  {
    topic: 'order:legacy-export', version: 'v1', reserved: false,
    consumers: [], producers: [ordersApi], status: 'deprecation-candidate', schemaMismatch: false, changes: [],
    messageSchema: obj({ orderId: str({ format: 'uuid' }), exportedAt: str({ format: 'date-time' }) }, ['orderId']),
  },

  // Reserved utility topic: never carries a compatibility verdict — every service has the same ones
  // and their churn is noise.
  // SCHEMA MISMATCH: two services handle one topic and declare different inbound shapes, which is
  // the state the `schema mismatch` badge exists for. Deliberately covering all four kinds of
  // disagreement the union view has to render, because a fixture that only shows one teaches the UI
  // half a job:
  //   - `warehouse` declared by one consumer and not the other (presence)
  //   - `quantity` declared as different types             (kind conflict, which stops the walk)
  //   - `reference` differing only in maxLength            (outside the .NET comparer's taxonomy —
  //                                                         the case that argued for raw declarations)
  //   - `note` optional on one side, required on the other (requiredness)
  {
    topic: 'inventory:adjust', version: 'v1', reserved: false,
    consumers: [shippingApi, paymentsApi], producers: [ordersApi], status: null,
    schemaMismatch: true, changes: [],
    // The representative schema is one declaration, not a synthesis — the aggregator picks the first
    // consumer that declared one, and the UI must never present it as everyone's contract.
    requestSchema: obj({
      sku: str(),
      warehouse: str(),
      quantity: int(),
      reference: str({ maxLength: 12 }),
      note: str(),
    }, ['sku', 'warehouse', 'note']),
    declaredSchemas: [
      {
        service: 'shipping-api', role: 'consumer',
        requestSchema: obj({
          sku: str(),
          warehouse: str(),
          quantity: int(),
          reference: str({ maxLength: 12 }),
          note: str(),
        }, ['sku', 'warehouse', 'note']),
        responseSchema: null, messageSchema: null,
      },
      {
        service: 'payments-api', role: 'consumer',
        requestSchema: obj({
          sku: str(),
          quantity: str(),
          reference: str({ maxLength: 64 }),
          note: str(),
        }, ['sku']),
        responseSchema: null, messageSchema: null,
      },
    ],
  },

  { topic: 'spec', version: '', reserved: true, consumers: [ordersApi, paymentsApi], producers: [], status: null, schemaMismatch: false, changes: [] },
];

// ── derive each entry's compatibility from the schemas beside it ─────────────────────────────────
const byTopic = new Map();
for (const entry of topics) {
  if (entry.reserved) continue;
  if (!byTopic.has(entry.topic)) byTopic.set(entry.topic, []);
  byTopic.get(entry.topic).push(entry);
}

for (const [topic, versions] of byTopic) {
  versions.forEach((entry, index) => {
    if (index === 0) {
      entry.compatibility = versions.length <= 1
        ? {
          baselineVersion: null, overall: 'notCompared', changes: [],
          notComparedReason: 'onlyOneVersion', truncatedPaths: [], notComparedSides: [],
        }
        : null; // the oldest of several has nothing before it to compare to
      return;
    }
    entry.compatibility = compare(topic, versions[index - 1], entry);

    // The RUN-OVER-RUN axis, derived from the same walk. The aggregator classifies drift down to the
    // field (MeshTopicChange.SchemaChanges), so the fixture must too — a `schema-changed` entry with
    // no breakdown is what the UI renders as "this catalogue does not classify drift", and a sample
    // that shows only that teaches the UI the unclassified path is normal.
    const schemaChanged = (entry.changes ?? []).find((c) => c.kind === 'schema-changed');
    if (schemaChanged && entry.compatibility?.changes?.length) {
      schemaChanged.schemaChanges = entry.compatibility.changes.map((c) => ({
        kind: c.kind, direction: c.direction, path: c.path,
        description: c.description, compatibility: c.compatibility,
      }));
      schemaChanged.compatibility = entry.compatibility.overall;
    }
  });
}

// ── versionCompatibility: the TOPOLOGY reconciliation, deliberately including the vacuous case ────
// orders:create and orders:get-all are consumed at two versions and produced by nobody in the
// estate, so `producedNotConsumed` is empty and `isCompatible` computes TRUE with no evidence behind
// it. That is not a fixture quirk — it is what the aggregator emits for every HTTP-fronted topic,
// and the UI has to refuse to render it as an all-clear.
const versionCompatibility = [
  { topic: 'orders:create', producedVersions: [], consumedVersions: ['v1', 'v2'], producedNotConsumed: [], consumedNotProduced: [], isCompatible: true },
  { topic: 'orders:get-all', producedVersions: [], consumedVersions: ['v1', 'v2'], producedNotConsumed: [], consumedNotProduced: [], isCompatible: true },
  { topic: 'payment:capture', producedVersions: ['v1', 'v2'], consumedVersions: ['v1'], producedNotConsumed: ['v2'], consumedNotProduced: [], isCompatible: false },
  { topic: 'shipping:book', producedVersions: ['v1', 'v2'], consumedVersions: ['v1', 'v2'], producedNotConsumed: [], consumedNotProduced: [], isCompatible: true },
  { topic: 'inventory:reserve', producedVersions: ['v1', 'v2'], consumedVersions: ['v1', 'v2'], producedNotConsumed: [], consumedNotProduced: [], isCompatible: true },
  { topic: 'notification:send', producedVersions: ['v1', 'v2'], consumedVersions: ['v1', 'v2'], producedNotConsumed: [], consumedNotProduced: [], isCompatible: true },
];

const catalog = {
  generatedAtUtc: '2026-08-16T09:12:00Z',
  topics,
  removedTopics: [{ topic: 'order:export', version: 'v0' }],
  versionCompatibility,
};

writeFileSync(join(artifacts, 'topics.json'), `${JSON.stringify(catalog, null, 2)}\n`);

const counts = topics
  .filter((t) => t.compatibility)
  .reduce((acc, t) => ({ ...acc, [t.compatibility.overall]: (acc[t.compatibility.overall] ?? 0) + 1 }), {});
console.log(`topics.json -> ${topics.length} entries`);
console.log('  verdicts:', counts);
console.log('  truncated paths:', topics.flatMap((t) => t.compatibility?.truncatedPaths ?? []));
