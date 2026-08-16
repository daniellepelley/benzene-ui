#!/usr/bin/env node
/**
 * Regenerates `contracts/artifacts/topics.rollout.json` — an estate part-way through several
 * coordinated releases.
 *
 * A SECOND ESTATE, not a replacement. `topics.json` is designed around the *verdict* classes (one
 * topic per compatibility outcome) and is the estate a developer sees on first run. This one is
 * designed around the *rollout* states, because the two are independent: four of the five scenarios
 * below carry the identical `breaking` verdict and need four different answers, and a fixture that
 * only varies the verdict cannot tell whether the product has noticed.
 *
 * FIVE SCENARIOS, one per row of the decision table a release manager actually faces:
 *
 *   A  payment:capture   PRODUCER AHEAD    orders-api emits v2 (breaking); payments-api handles v1
 *                                          only. The reader has not been built.
 *
 *   B  inventory:reserve CONSUMER AHEAD    shipping-api handles v2 ONLY (it dropped v1); orders-api
 *                        — AND BROKEN      still sends v1. The version sets are DISJOINT, which is
 *                                          the one case where the product may say categorically
 *                                          that nothing handles what is being sent. It is also the
 *                                          case the naive rule gets backwards: the late party is
 *                                          the caller, not the handler that already moved.
 *
 *   C  order:placed  →   COORDINATED SET,  A breaking change to order:placed forces billing-api to
 *      invoice:raise    PART-DONE          move; billing's move changes invoice:raise, which
 *                                          ledger-api has ALREADY built a handler for. orders-api
 *                                          and ledger-api are done; billing-api is the single
 *                                          remaining blocker, and it carries TWO obligations in two
 *                                          different roles. Note the second hop is `compatible` —
 *                                          the obligation propagated, the deploy did not.
 *
 *   D  notification:send ALREADY DONE      Additive, both ends on both versions. Without a
 *                                          no-action row every screen is an alarm and readers stop
 *                                          reading.
 *
 *   E  shipping:book    VERSIONED OUT      Breaking, and BOTH sides run BOTH versions. The coupling
 *                                          is real and already mitigated. A tool that cannot tell
 *                                          this from scenario A cries wolf on every correctly
 *                                          managed migration — and this estate is where that is
 *                                          measured rather than assumed.
 *
 * The compatibility blocks are DERIVED from the schemas beside each entry by a walker mirroring
 * `Benzene.Schema.Compatibility/JsonSchemaComparer`, for the reason given at the top of
 * `compose-topics-fixture.mjs`: a fixture whose change list disagrees with its own schemas teaches
 * the UI to render a shape the real aggregator never emits. The walker is fixture-generation only;
 * the aggregator remains the authority, and if the two disagree this file is the bug.
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

// ── the walker, mirroring Benzene.Schema.Compatibility/JsonSchemaComparer (fixture use only) ──────
const RULES = {
  propertyAdded: ['compatible', 'compatible', 'compatible'],
  requiredPropertyAdded: ['breaking', 'compatible', 'compatible'],
  propertyRemoved: ['warning', 'breaking', 'breaking'],
  propertyBecameRequired: ['breaking', 'compatible', 'compatible'],
  propertyBecameOptional: ['compatible', 'warning', 'warning'],
  typeChanged: ['breaking', 'breaking', 'breaking'],
};
const DIR = { request: 0, response: 1, event: 2 };
const verdict = (kind, direction) => RULES[kind][DIR[direction]];
const describe = (s) => (s.format ? `${s.type}/${s.format}` : (s.type ?? 'object'));
const change = (kind, direction, path, description) =>
  ({ kind, direction, path, description, compatibility: verdict(kind, direction) });

function walk(baseline, current, direction, path, changes, depth = 0) {
  if (!baseline || !current || depth > 32) return;
  if (baseline.type !== current.type || baseline.format !== current.format) {
    changes.push(change('typeChanged', direction, path,
      `Type changed from '${describe(baseline)}' to '${describe(current)}'`));
    return;
  }
  const before = baseline.properties ?? {};
  const after = current.properties ?? {};
  const wasReq = new Set(baseline.required ?? []);
  const isReq = new Set(current.required ?? []);

  for (const name of Object.keys(before)) {
    if (!(name in after)) {
      changes.push(change('propertyRemoved', direction, `${path}.${name}`, `Property '${name}' was removed`));
    }
  }
  for (const name of Object.keys(after)) {
    if (!(name in before)) {
      const required = isReq.has(name);
      changes.push(change(required ? 'requiredPropertyAdded' : 'propertyAdded', direction, `${path}.${name}`,
        `Property '${name}' was added${required ? ' (required)' : ''}`));
    }
  }
  for (const name of Object.keys(before)) {
    if (!(name in after)) continue;
    if (!wasReq.has(name) && isReq.has(name)) {
      changes.push(change('propertyBecameRequired', direction, `${path}.${name}`, `Property '${name}' became required`));
    } else if (wasReq.has(name) && !isReq.has(name)) {
      changes.push(change('propertyBecameOptional', direction, `${path}.${name}`, `Property '${name}' became optional`));
    }
    walk(before[name], after[name], direction, `${path}.${name}`, changes, depth + 1);
  }
}

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
    walk(before, after, direction, `${topic}.${side}`, changes);
  }
  if (compared === 0) {
    return {
      baselineVersion: baseline.version, overall: 'notCompared', changes: [],
      notComparedReason: 'noSchemaPublished', truncatedPaths: [], notComparedSides,
    };
  }
  const overall = changes.some((c) => c.compatibility === 'breaking') ? 'breaking'
    : changes.some((c) => c.compatibility === 'warning') ? 'warning' : 'compatible';
  return {
    baselineVersion: baseline.version, overall, changes, notComparedReason: null,
    truncatedPaths: changes.filter((c) => c.kind === 'typeChanged').map((c) => c.path),
    notComparedSides,
  };
}

// ── the estate ───────────────────────────────────────────────────────────────────────────────────
const S = (service, httpMappings) => (httpMappings ? { service, httpMappings } : { service });
const orders = 'orders-api';
const payments = 'payments-api';
const shipping = 'shipping-api';
const billing = 'billing-api';
const ledger = 'ledger-api';

const topics = [
  // ── A: PRODUCER AHEAD. orders-api emits v2; payments-api handles v1 only. Breaking. ────────────
  {
    topic: 'payment:capture', version: 'v1', reserved: false,
    producers: [S(orders)], consumers: [S(payments, [{ method: 'POST', path: '/payments/capture' }])],
    status: null, schemaMismatch: false, changes: [],
    messageSchema: obj({ orderId: str({ format: 'uuid' }), amount: int() }, ['orderId']),
  },
  {
    topic: 'payment:capture', version: 'v2', reserved: false,
    producers: [S(orders)], consumers: [],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (message)' }],
    messageSchema: obj({
      orderId: str({ format: 'uuid' }), amount: num(), currency: str({ enum: ['GBP', 'EUR', 'USD'] }),
    }, ['orderId', 'currency']),
  },

  // ── B: CONSUMER AHEAD AND BROKEN. shipping-api dropped v1; orders-api still emits v1. ──────────
  {
    topic: 'inventory:reserve', version: 'v1', reserved: false,
    producers: [S(orders)], consumers: [],
    status: null, schemaMismatch: false, changes: [],
    requestSchema: obj({ sku: str(), quantity: int() }, ['sku', 'quantity']),
  },
  {
    topic: 'inventory:reserve', version: 'v2', reserved: false,
    producers: [], consumers: [S(shipping, [{ method: 'POST', path: '/inventory/reserve' }])],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (request)' }],
    requestSchema: obj({ sku: str(), quantity: int(), reservationRef: str({ format: 'uuid' }) },
      ['sku', 'quantity', 'reservationRef']),
  },

  // ── C: COORDINATED SET, visible only transitively. orders → billing → ledger. ──────────────────
  {
    topic: 'order:placed', version: 'v1', reserved: false,
    producers: [S(orders)], consumers: [S(billing)],
    status: null, schemaMismatch: false, changes: [],
    messageSchema: obj({ orderId: str({ format: 'uuid' }), total: num(), customerId: str({ format: 'uuid' }) },
      ['orderId', 'total']),
  },
  {
    topic: 'order:placed', version: 'v2', reserved: false,
    producers: [S(orders)], consumers: [],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (message)' }],
    // customerId renamed to customerRef, and a required tax jurisdiction added.
    messageSchema: obj({
      orderId: str({ format: 'uuid' }), total: num(), customerRef: str({ format: 'uuid' }),
      taxJurisdiction: str({ enum: ['UK', 'EU', 'US'] }),
    }, ['orderId', 'total', 'taxJurisdiction']),
  },
  {
    topic: 'invoice:raise', version: 'v1', reserved: false,
    producers: [S(billing)], consumers: [S(ledger)],
    status: null, schemaMismatch: false, changes: [],
    messageSchema: obj({ invoiceId: str({ format: 'uuid' }), net: num(), gross: num() },
      ['invoiceId', 'net', 'gross']),
  },
  {
    topic: 'invoice:raise', version: 'v2', reserved: false,
    // ledger-api has ALREADY deployed and handles both versions — the safe direction, done properly.
    // billing-api cannot emit v2 until it can read order:placed v2, so it is the one blocker left in
    // a three-service chain whose two ends are ready. A reader has to find that by joining two topics.
    producers: [], consumers: [S(ledger)],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (message)' }],
    messageSchema: obj({
      invoiceId: str({ format: 'uuid' }), net: num(), gross: num(),
      taxJurisdiction: str({ enum: ['UK', 'EU', 'US'] }),
    }, ['invoiceId', 'net', 'gross', 'taxJurisdiction']),
  },

  // ── D: ALREADY DONE. Additive, both ends on both versions. ─────────────────────────────────────
  {
    topic: 'notification:send', version: 'v1', reserved: false,
    producers: [S(orders)], consumers: [S(payments)],
    status: null, schemaMismatch: false, changes: [],
    requestSchema: obj({ recipient: str({ format: 'email' }), template: str() }, ['recipient', 'template']),
  },
  {
    topic: 'notification:send', version: 'v2', reserved: false,
    producers: [S(orders)], consumers: [S(payments)],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (request)' }],
    requestSchema: obj({ recipient: str({ format: 'email' }), template: str(), locale: str() },
      ['recipient', 'template']),
  },

  // ── E: VERSIONED OUT. Breaking, but both sides run both versions — coupling already mitigated. ─
  {
    topic: 'shipping:book', version: 'v1', reserved: false,
    producers: [S(orders), S(payments)], consumers: [S(shipping)],
    status: null, schemaMismatch: false, changes: [],
    messageSchema: obj({
      orderId: str({ format: 'uuid' }),
      address: obj({ line1: str(), line2: str(), postcode: str() }, ['line1', 'postcode']),
    }, ['orderId', 'address']),
  },
  {
    topic: 'shipping:book', version: 'v2', reserved: false,
    producers: [S(orders), S(payments)], consumers: [S(shipping)],
    status: null, schemaMismatch: false,
    changes: [{ kind: 'schema-changed', description: 'Payload schema changed (message)' }],
    messageSchema: obj({
      orderId: str({ format: 'uuid' }),
      address: obj({ line1: str(), postcode: str() }, ['line1', 'postcode']),
    }, ['orderId', 'address']),
  },

  { topic: 'spec', version: '', reserved: true, producers: [], consumers: [S(orders), S(payments), S(shipping), S(billing), S(ledger)], status: null, schemaMismatch: false, changes: [] },
];

// ── derive compatibility from the schemas beside each entry ──────────────────────────────────────
const byTopic = new Map();
for (const e of topics) {
  if (e.reserved) continue;
  if (!byTopic.has(e.topic)) byTopic.set(e.topic, []);
  byTopic.get(e.topic).push(e);
}
for (const [topic, versions] of byTopic) {
  versions.forEach((e, i) => {
    e.compatibility = i === 0
      ? (versions.length <= 1
        ? { baselineVersion: null, overall: 'notCompared', changes: [], notComparedReason: 'onlyOneVersion', truncatedPaths: [], notComparedSides: [] }
        : null)
      : compare(topic, versions[i - 1], e);
  });
}

// ── versionCompatibility: the topology reconciliation, derived so it cannot contradict the rows ──
const versionCompatibility = [...byTopic.entries()].map(([topic, versions]) => {
  const produced = versions.filter((v) => v.producers.length > 0).map((v) => v.version);
  const consumed = versions.filter((v) => v.consumers.length > 0).map((v) => v.version);
  if (new Set([...produced, ...consumed]).size <= 1) return null;
  return {
    topic,
    producedVersions: produced,
    consumedVersions: consumed,
    producedNotConsumed: produced.filter((v) => !consumed.includes(v)),
    consumedNotProduced: consumed.filter((v) => !produced.includes(v)),
    isCompatible: produced.filter((v) => !consumed.includes(v)).length === 0,
  };
}).filter(Boolean);


writeFileSync(join(artifacts, 'topics.rollout.json'), `${JSON.stringify({
  generatedAtUtc: '2026-08-16T11:20:00Z', topics, removedTopics: [], versionCompatibility,
}, null, 2)}\n`);

console.log(`topics.rollout.json — ${topics.length} entries, ${versionCompatibility.length} reconciled topics`);
