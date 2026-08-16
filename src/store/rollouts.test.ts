import { describe, it, expect } from 'vitest';
import { buildRollouts, type Rollout } from './rollouts';
import type { TopicsTopicsItem, TopicsVersionCompatibilityItem } from '../contracts';

/**
 * The five scenarios the round-5 deploy estate was built to contain, as data.
 *
 * Four of the five carry the identical `breaking` verdict and they need four different answers, so
 * these are the cases that decide whether the model is worth anything. They are written out rather
 * than loaded from an artifact because the point of each one is the SHAPE, and a reader of this file
 * has to be able to see the shape without opening a fixture.
 */
const party = (...services: string[]) => services.map((service) => ({ service }));

const pair = (
  topic: string,
  version: string,
  direction: 'request' | 'response' | 'event',
  overall: string,
  producers: string[],
  consumers: string[],
): TopicsTopicsItem => ({
  topic,
  version,
  producers: party(...producers),
  consumers: party(...consumers),
  compatibility: {
    baselineVersion: 'v1',
    overall,
    changes: [{ kind: 'propertyRemoved', direction, path: `${topic}.x`, description: '', compatibility: overall }],
    notComparedReason: null,
    truncatedPaths: [],
    notComparedSides: [],
  },
} as unknown as TopicsTopicsItem);

const baseline = (topic: string, producers: string[], consumers: string[]): TopicsTopicsItem => ({
  topic, version: 'v1', producers: party(...producers), consumers: party(...consumers),
} as unknown as TopicsTopicsItem);

const skew = (
  topic: string, producedVersions: string[], consumedVersions: string[],
): TopicsVersionCompatibilityItem => ({
  topic, producedVersions, consumedVersions,
  producedNotConsumed: producedVersions.filter((v) => !consumedVersions.includes(v)),
  consumedNotProduced: consumedVersions.filter((v) => !producedVersions.includes(v)),
  isCompatible: true,
} as unknown as TopicsVersionCompatibilityItem);

/** A: producer ahead on an event. The reader has not been built. Live gap. */
const A = [baseline('payment:capture', ['orders-api'], ['payments-api']),
  pair('payment:capture', 'v2', 'event', 'breaking', ['orders-api'], [])];
/** B: the CONSUMER moved first, on a request topic. The caller is the late party. */
const B = [baseline('inventory:reserve', ['orders-api'], []),
  pair('inventory:reserve', 'v2', 'request', 'breaking', [], ['shipping-api'])];
/** C1: same shape as A, no telemetry anywhere. Structure alone has to find it. */
const C1 = [baseline('order:placed', ['orders-api'], ['billing-api']),
  pair('order:placed', 'v2', 'event', 'breaking', ['orders-api'], [])];
/** C2: the adapter is ready and idle. Nothing is broken; the rollout is unfinished. */
const C2 = [baseline('invoice:raise', ['billing-api'], ['ledger-api']),
  pair('invoice:raise', 'v2', 'event', 'compatible', [], ['ledger-api'])];
/** E: breaking, and versioned out. Every party declares both versions. */
const E = [baseline('shipping:book', ['orders-api', 'payments-api'], ['shipping-api']),
  pair('shipping:book', 'v2', 'event', 'breaking', ['orders-api', 'payments-api'], ['shipping-api'])];

const estate = [...A, ...B, ...C1, ...C2, ...E];
const estateSkew = [
  skew('payment:capture', ['v1', 'v2'], ['v1']),
  skew('inventory:reserve', ['v1'], ['v2']),
  skew('order:placed', ['v1', 'v2'], ['v1']),
  skew('invoice:raise', ['v1'], ['v1', 'v2']),
  skew('shipping:book', ['v1', 'v2'], ['v1', 'v2']),
];

const build = (topics = estate, sk = estateSkew) => {
  const rows = buildRollouts(topics, sk);
  return (topic: string) => rows.find((r) => r.topic === topic) as Rollout;
};

describe('rollouts — one rule over five differently-shaped rollouts', () => {
  const at = build();

  it('A: an event producer ahead of its reader owes the READER a catch-up', () => {
    const r = at('payment:capture');
    expect(r.state).toBe('awaitingAdapter');
    expect(r.outstanding).toEqual(['payments-api']);
    expect(r.moved).toEqual(['orders-api']);
    expect(r.obligations[0]).toMatchObject({ service: 'payments-api', kind: 'catchUp', verb: 'handle v2' });
  });

  /**
   * The case the naive rule gets backwards. `shipping-api` is the one that already shipped; a tool
   * that reads "a version with no handler" and says "the consumers must catch up" sends a release
   * manager to the wrong team during an outage.
   */
  it('B: a consumer that moved first on a request topic makes the CALLER the late party', () => {
    const r = at('inventory:reserve');
    expect(r.state).toBe('awaitingAdapter');
    expect(r.outstanding).toEqual(['orders-api']);
    expect(r.obligations[0]).toMatchObject({ service: 'orders-api', role: 'producers', verb: 'send v2' });
  });

  it('B: disjoint version sets earn the one categorical claim the product may make', () => {
    expect(at('inventory:reserve').disjoint).toBe(true);
    expect(at('inventory:reserve').disjointNote).toContain('is handled in this estate');
    // Everywhere else a producer declaring two versions may be dual-publishing, and mesh cannot tell.
    expect(at('payment:capture').disjoint).toBe(false);
    expect(at('payment:capture').disjointNote).toBeNull();
  });

  it('C: the silent one is found from structure alone, with no telemetry involved', () => {
    const r = at('order:placed');
    expect(r.state).toBe('awaitingAdapter');
    expect(r.outstanding).toEqual(['billing-api']);
  });

  /**
   * An obligation is NOT a function of the verdict. `invoice:raise` is `compatible` and still owes a
   * deploy — if obligation were derived from severity this row would vanish, which is precisely how
   * a half-migration ships.
   */
  it('C: a compatible change still carries an outstanding completion', () => {
    const r = at('invoice:raise');
    expect(r.verdict).toBe('compatible');
    expect(r.state).toBe('awaitingOwner');
    expect(r.obligations[0]).toMatchObject({ service: 'billing-api', kind: 'completion', verb: 'produce v2' });
  });

  it('E: breaking with an overlap window owes nobody anything', () => {
    const r = at('shipping:book');
    expect(r.verdict).toBe('breaking');
    expect(r.state).toBe('complete');
    expect(r.overlapRetained).toBe(true);
    expect(r.outstanding).toEqual([]);
    expect(r.constraint).toBeNull();
  });

  it('ranks on the join, so the versioned-out breaking change is the calmest row', () => {
    const rows = buildRollouts(estate, estateSkew);
    expect(rows.map((r) => r.topic)).toEqual([
      'inventory:reserve', // disjoint — the only proven outage
      'order:placed',      // breaking, catch-up outstanding
      'payment:capture',   // breaking, catch-up outstanding
      'invoice:raise',     // compatible, completion outstanding
      'shipping:book',     // breaking, and nothing to do
    ]);
  });
});

describe('rollouts — the constraint sentence', () => {
  const at = build();

  it('states the order for a catch-up, naming what the mover has already done', () => {
    expect(at('payment:capture').constraint).toBe(
      'payments-api must handle payment:capture v2 before orders-api stops producing v1. '
      + 'orders-api already produces v2.');
  });

  it('uses "send" for a caller adapting to a handler, not "produce"', () => {
    expect(at('inventory:reserve').constraint).toContain('is still sending it');
    expect(at('inventory:reserve').constraint).toContain('must send v2');
  });

  /**
   * "A must move before B stops" is the right sentence only while B has not stopped. On
   * `inventory:reserve` the handler dropped v1 already, so the deadline has passed and the calls are
   * failing now — and an on-call engineer read the future tense as "not yet urgent" while the edge
   * was at a 100% error rate.
   */
  it('switches to the present tense when the deadline has already passed', () => {
    const r = at('inventory:reserve');
    expect(r.breached).toBe(true);
    expect(r.constraint).toBe(
      'shipping-api no longer handles inventory:reserve v1, and orders-api is still sending it. '
      + 'orders-api must send v2.');
  });

  it('keeps the future tense while the other side genuinely has not stopped', () => {
    // orders-api still produces payment:capture v1, so payments-api does still have time.
    const r = at('payment:capture');
    expect(r.breached).toBe(false);
    expect(r.constraint).toContain('before orders-api stops producing v1');
  });

  it('states a completion as unblocked rather than as a deadline', () => {
    expect(at('invoice:raise').constraint).toBe(
      'ledger-api already handles invoice:raise v2, so billing-api can move whenever it is ready.');
  });

  it('never uses a future tense, a sequence, or the word "safe"', () => {
    for (const r of buildRollouts(estate, estateSkew)) {
      const text = `${r.constraint ?? ''} ${r.disjointNote ?? ''}`.toLowerCase();
      for (const banned of ['safe', 'ready to deploy', 'first', 'then', 'schedul', 'will ', 'plan']) {
        expect(text).not.toContain(banned);
      }
    }
  });
});

describe('rollouts — what it refuses to say', () => {
  it('names nobody when the adapting side has no in-estate service at any version', () => {
    // An HTTP-fronted topic: the callers are browsers and partners, and mesh cannot see them.
    const topics = [
      baseline('orders:create', [], ['orders-api']),
      pair('orders:create', 'v2', 'request', 'breaking', [], ['orders-api']),
    ];
    const r = buildRollouts(topics, [skew('orders:create', [], ['v1', 'v2'])])[0]!;
    expect(r.state).toBe('unattributable');
    expect(r.unattributableSide).toBe('producers');
    expect(r.outstanding).toEqual([]);
    // And it is still IN the list. An uncovered version whose other end is invisible is a bigger
    // risk than one whose other end is named; dropping it would be absence rendered as good news.
    expect(r.topic).toBe('orders:create');
  });

  it('never states an ordering it could not compare', () => {
    const topics = [
      baseline('opaque:topic', ['a-api'], ['b-api']),
      pair('opaque:topic', 'v2', 'event', 'notCompared', ['a-api'], []),
    ];
    const r = buildRollouts(topics, [skew('opaque:topic', ['v1', 'v2'], ['v1'])])[0]!;
    expect(r.state).toBe('notCompared');
    expect(r.constraint).toBeNull();
    expect(r.obligations).toEqual([]);
  });

  it('states no ordering when a pair mixes event and request directions', () => {
    // Neither side can be called the owner, and picking one would be a guess in the one place a
    // guess is an outage.
    const mixed = {
      ...pair('both:ways', 'v2', 'event', 'breaking', ['a-api'], []),
    } as TopicsTopicsItem;
    mixed.compatibility!.changes.push({
      kind: 'requiredPropertyAdded', direction: 'request', path: 'both:ways.y',
      description: '', compatibility: 'breaking',
    } as never);
    const r = buildRollouts(
      [baseline('both:ways', ['a-api'], ['b-api']), mixed],
      [skew('both:ways', ['v1', 'v2'], ['v1'])],
    )[0]!;
    expect(r.mixedDirections).toBe(true);
    expect(r.constraint).toBeNull();
    // It still names who is at the baseline — refusing to order is not refusing to attribute.
    expect(r.outstanding.length).toBeGreaterThan(0);
  });

  it('emits nothing for a topic with a single version', () => {
    expect(buildRollouts([baseline('solo:topic', ['a-api'], ['b-api'])], [])).toEqual([]);
  });

  it('excludes reserved topics, whose churn every service carries alike', () => {
    const reserved = { ...pair('benzene:mesh:query', 'v2', 'event', 'breaking', ['a-api'], []), reserved: true };
    expect(buildRollouts([reserved as TopicsTopicsItem], [])).toEqual([]);
  });
});
