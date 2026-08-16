import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { loadService } from './slices/estateSlice';
import { utilityToggled } from './slices/viewSlice';
import {
  selectUsageForService, selectServiceAbout, usageGroups, formatCount, formatAge, formatStamp,
} from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';
import type { ServiceSnapshot, Usage, UsageEntriesItem } from '../contracts';

const entry = (over: Partial<UsageEntriesItem>): UsageEntriesItem => ({
  topic: 'orders:create',
  version: null,
  service: 'orders-api',
  transport: 'http',
  status: 'ok',
  count: 100,
  avgDurationMs: null,
  source: 'test',
  ...over,
});

const usageOf = (entries: UsageEntriesItem[]): Usage => ({
  generatedAtUtc: '2026-08-09T06:00:00Z',
  windowStartUtc: '2026-08-08T06:00:00Z',
  windowEndUtc: '2026-08-09T06:00:00Z',
  entries,
});

const ready = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadCatalog());
  return store;
};

describe('per-service usage', () => {
  it('says nothing can be said when no usage feed is wired', async () => {
    const store = await ready({
      getUsage: async () => {
        throw new Error('no usage source wired');
      },
    });
    expect(selectUsageForService(store.getState(), 'orders-api').mode).toBe('none');
  });

  it('reports the service\'s own counts when the feed attributes them', async () => {
    const store = await ready({
      getUsage: async () => usageOf([entry({}), entry({ service: 'payments-api', count: 5 })]),
    });

    const usage = selectUsageForService(store.getState(), 'orders-api');
    expect(usage.mode).toBe('own');
    expect(usage.entries).toHaveLength(1);
    expect(usage.entries[0]?.count).toBe(100);
  });

  it('distinguishes "wired and saw nothing" from "no feed"', async () => {
    // Both render as an absence of numbers, and they mean opposite things: one is an observation
    // about the service, the other an admission about the tooling.
    const store = await ready({ getUsage: async () => usageOf([entry({ service: 'payments-api' })]) });

    const usage = selectUsageForService(store.getState(), 'orders-api');
    expect(usage.mode).toBe('own');
    expect(usage.entries).toHaveLength(0);
  });

  it('falls back to fleet-wide counts, and labels them as such, when the feed has no service dimension', async () => {
    const store = await ready({
      getUsage: async () => usageOf([entry({ service: null }), entry({ topic: 'payment:capture', service: null })]),
    });

    const usage = selectUsageForService(store.getState(), 'orders-api');
    expect(usage.mode).toBe('fleet-wide');
    // Only the topics this service actually consumes — not the whole feed.
    expect(usage.entries.map((e) => e.topic)).toEqual(['orders:create']);
  });

  it('excludes utility traffic by default and states what it excluded', async () => {
    const store = await ready({
      getUsage: async () => usageOf([entry({}), entry({ topic: 'benzene:spec', count: 9800 })]),
    });

    const usage = selectUsageForService(store.getState(), 'orders-api');
    expect(usage.entries).toHaveLength(1);
    expect(usage.hidden).toEqual({ entries: 1, messages: 9800 });
    expect(usage.allUtility).toBe(false);
  });

  it('flags a service whose entire observed traffic was benzene plumbing', async () => {
    // An empty panel here would read as "no traffic observed", which is false and actionable in the
    // wrong direction — someone would go looking for a dead service that is merely quiet on domain work.
    const store = await ready({
      getUsage: async () => usageOf([entry({ topic: 'benzene:spec', count: 4210 })]),
    });

    const usage = selectUsageForService(store.getState(), 'orders-api');
    expect(usage.entries).toHaveLength(0);
    expect(usage.allUtility).toBe(true);
  });

  it('lets the reader ask for the utility traffic back', async () => {
    const store = await ready({
      getUsage: async () => usageOf([entry({}), entry({ topic: 'benzene:spec', count: 9800 })]),
    });
    store.dispatch(utilityToggled());

    const usage = selectUsageForService(store.getState(), 'orders-api');
    expect(usage.entries).toHaveLength(2);
    expect(usage.hidden).toEqual({ entries: 0, messages: 0 });
  });

  it('treats a topic the catalog marks reserved as utility, without a hardcoded name list', async () => {
    const store = await ready({
      getUsage: async () => usageOf([entry({ topic: 'spec', count: 12 })]),
    });
    // `spec` carries no benzene prefix — it is only utility because the catalog says `reserved: true`.
    expect(selectUsageForService(store.getState(), 'orders-api').hidden.entries).toBe(1);
  });
});

describe('usage grouping', () => {
  it('keeps an unattributed dimension visible rather than guessing at it', () => {
    const groups = usageGroups([entry({ transport: null, count: 3 }), entry({ transport: 'http', count: 7 })], 'transport');
    expect(groups).toEqual([
      { key: 'http', count: 7 },
      { key: '(unattributed)', count: 3 },
    ]);
  });

  it('sums per distinct value, largest first', () => {
    const groups = usageGroups(
      [entry({ status: 'ok', count: 5 }), entry({ status: 'ok', count: 5 }), entry({ status: 'error', count: 20 })],
      'status',
    );
    expect(groups).toEqual([
      { key: 'error', count: 20 },
      { key: 'ok', count: 10 },
    ]);
  });
});

describe('service self-description', () => {
  const snapshot = (over: Partial<ServiceSnapshot> = {}): ServiceSnapshot => ({
    name: 'orders-api',
    fetchedAtUtc: '2026-08-09T05:58:11Z',
    specJson: JSON.stringify({ info: { title: 'Orders', description: 'Tracks orders.', version: '2.4.0' } }),
    specHash: null,
    previousSpecHash: null,
    contractDrift: false,
    health: null,
    error: null,
    ...over,
  });

  const loaded = async (snap: ServiceSnapshot) => {
    const store = createStore(fakeMeshApi({ getService: async () => snap }));
    await store.dispatch(loadService(snap.name));
    return store;
  };

  it('reads the description and version out of the stored spec', async () => {
    const store = await loaded(snapshot());
    const about = selectServiceAbout(store.getState(), 'orders-api');
    expect(about?.description).toBe('Tracks orders.');
    expect(about?.version).toBe('2.4.0');
  });

  it('survives a spec that is not JSON', async () => {
    // The aggregator stores whatever the service published, verbatim. A service that serves YAML,
    // or HTML from a misrouted proxy, must not take the panel down with it.
    const store = await loaded(snapshot({ specJson: '<html>404</html>' }));
    const about = selectServiceAbout(store.getState(), 'orders-api');
    expect(about?.description).toBeNull();
    expect(about?.fetchedAtUtc).toBe('2026-08-09T05:58:11Z');
  });

  it('survives a spec with no info block', async () => {
    const store = await loaded(snapshot({ specJson: JSON.stringify({ topics: [] }) }));
    expect(selectServiceAbout(store.getState(), 'orders-api')?.version).toBeNull();
  });

  it('reports drift only when both hashes are known', async () => {
    // "The contract changed" with nothing to compare against is a claim the snapshot cannot support.
    const halfKnown = await loaded(snapshot({ contractDrift: true, specHash: 'abc123def456789', previousSpecHash: null }));
    expect(selectServiceAbout(halfKnown.getState(), 'orders-api')?.drift).toBeNull();

    const bothKnown = await loaded(
      snapshot({ contractDrift: true, specHash: 'abc123def456789', previousSpecHash: 'zzz999yyy888777' }),
    );
    expect(selectServiceAbout(bothKnown.getState(), 'orders-api')?.drift).toEqual({
      previous: 'zzz999yyy888…',
      current: 'abc123def456…',
    });
  });

  it('is null for a service whose snapshot has not been fetched', async () => {
    const store = createStore(fakeMeshApi());
    expect(selectServiceAbout(store.getState(), 'orders-api')).toBeNull();
  });
});

describe('formatting', () => {
  it('abbreviates counts the way the original UI did', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1_000)).toBe('1k');
    expect(formatCount(1_500)).toBe('1.5k');
    expect(formatCount(2_000_000)).toBe('2M');
  });

  it('keeps ages coarse — precise enough to judge staleness, vague enough not to imply precision', () => {
    expect(formatAge(4_000)).toBe('4s');
    expect(formatAge(120_000)).toBe('2m');
    expect(formatAge(7_200_000)).toBe('2h');
    expect(formatAge(3 * 24 * 3_600_000)).toBe('3d');
    // Clock skew can put an observation slightly in the future. "-3s ago" is worse than "just now".
    expect(formatAge(-3_000)).toBe('just now');
  });
});

/**
 * THE DATE/AGE RULE, at the one place that implements it.
 *
 * A date is never rendered without its age, and an age never without its date. Every surface goes
 * through here, and the `Stamp` primitive is the only component allowed to call it — so these
 * assertions are the whole rule, and `architecture.test.ts` enforces that nothing bypasses them.
 */
describe('formatStamp', () => {
  const NOW = Date.parse('2026-08-09T06:00:00Z');

  it('renders the date and the age together, always', () => {
    const stamp = formatStamp('2026-07-15T09:15:00Z', NOW);
    expect(stamp).not.toBeNull();
    expect(stamp!.date).toBe('2026-07-15 09:15 UTC');
    expect(stamp!.age).toBe('25d ago');
    expect(stamp!.text).toBe('2026-07-15 09:15 UTC (25d ago)');
  });

  it('formats in UTC, not the host locale', () => {
    // The artifacts are UTC and the collector is UTC. A reader comparing the screen against a log
    // line must not have to work out which zone the screen decided to use.
    expect(formatStamp('2026-01-02T23:45:00Z', NOW)!.date).toBe('2026-01-02 23:45 UTC');
    expect(formatStamp('2026-01-02T23:45:00+02:00', NOW)!.date).toBe('2026-01-02 21:45 UTC');
  });

  it('returns null for an absent or unparseable instant, so the caller states the third state', () => {
    // Never an epoch, never "1970": an absent timestamp is a fact about the feed, and a plausible
    // wrong date is worse than a stated absence.
    expect(formatStamp(null, NOW)).toBeNull();
    expect(formatStamp(undefined, NOW)).toBeNull();
    expect(formatStamp('', NOW)).toBeNull();
    expect(formatStamp('not a date', NOW)).toBeNull();
  });

  it('omits the age rather than inventing one before the clock has ticked', () => {
    // `fleet.now` rests at 0 until the app ticks it — that is "no clock yet", not midnight in 1970,
    // and computing an age from it would render every timestamp as 56 years old.
    const stamp = formatStamp('2026-07-15T09:15:00Z', 0);
    expect(stamp!.age).toBeNull();
    expect(stamp!.text).toBe('2026-07-15 09:15 UTC');
  });

  it('says "just now" rather than a negative age when the clock is skewed', () => {
    expect(formatStamp('2026-08-09T06:00:02Z', NOW)!.age).toBe('just now');
  });

  it('keeps the machine-readable instant, so a copy-paste survives', () => {
    expect(formatStamp('2026-07-15T09:15:00Z', NOW)!.iso).toBe('2026-07-15T09:15:00Z');
  });
});
