import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { probeFleet, clockTicked, fleetObserved, FLEET_POLL_MS } from './slices/fleetSlice';
import { fleetView, fleetService, fleetTopic } from '../test/fleetView';
import type { FleetView } from '../contracts';
import { selectFeedHealth } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const T0 = Date.parse('2026-08-09T06:00:00Z');

const snapshot = (over: Partial<FleetView> = {}): FleetView =>
  fleetView({
    generatedAt: '2026-08-09T06:00:00Z',
    services: [fleetService({ service: 'orders-api', health: 'healthy', lastSeen: '2026-08-09T05:59:50Z' })],
    ...over,
  });

const withCatalog = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadCatalog());
  store.dispatch(clockTicked(T0));
  return store;
};

describe('feed health', () => {
  it('says nothing at all when no live plane is wired', async () => {
    // The static floor. A page with no collector must not carry a warning about one.
    const store = await withCatalog();
    await store.dispatch(probeFleet());
    expect(selectFeedHealth(store.getState())).toBeNull();
  });

  it('reports a collector that has never answered as unreachable, not as quiet', async () => {
    const store = await withCatalog({
      getFleet: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await store.dispatch(probeFleet());
    store.dispatch(clockTicked(T0 + 8_000));

    const health = selectFeedHealth(store.getState());
    expect(health?.kind).toBe('bad');
    expect(health?.text).toMatch(/no successful poll yet/);
  });

  it('calls a connected collector that has never seen traffic blind, not healthy', async () => {
    // The single most important thing this exists for. Silence from a broken exporter looks exactly
    // like silence from an idle estate, and only one of them is good news.
    const store = await withCatalog({ getFleet: async () => snapshot() });
    await store.dispatch(probeFleet());

    const health = selectFeedHealth(store.getState());
    expect(health?.kind).toBe('warn');
    expect(health?.text).toMatch(/no traffic has been observed/);
    expect(health?.text).toMatch(/check the exporter wiring/);
  });

  it('does not let heartbeats count as traffic', async () => {
    // Heartbeats travel on the mesh's own feed. If they counted, a fleet heartbeating into a broken
    // exporter would report a healthy feed — the exact failure the blind state is here to catch.
    const store = await withCatalog({
      getFleet: async () =>
        snapshot({ services: [fleetService({ service: 'orders-api', health: 'healthy', lastSeen: '2026-08-09T05:59:59Z' })] }),
    });
    await store.dispatch(probeFleet());
    expect(selectFeedHealth(store.getState())?.kind).toBe('warn');
  });

  it('does not count a topic whose plane declares its stats missing', async () => {
    // The contract's invocations field is non-nullable, so a plane that cannot supply counts sends
    // zero. `missingFeeds` is how it says so — reading the zero as an observation would make a blind
    // feed look merely quiet, which is the whole failure this state exists to catch.
    const store = await withCatalog({
      getFleet: async () =>
        snapshot({ topics: [fleetTopic({ topic: 'orders:create', invocations: 7, missingFeeds: ['stats'] })] }),
    });
    await store.dispatch(probeFleet());

    expect(selectFeedHealth(store.getState())?.kind).toBe('warn');
  });

  it('goes healthy once real traffic is observed', async () => {
    const store = await withCatalog({
      getFleet: async () => snapshot({ topics: [fleetTopic({ topic: 'orders:create', invocations: 12 })] }),
    });
    await store.dispatch(probeFleet());

    const health = selectFeedHealth(store.getState());
    expect(health?.kind).toBe('ok');
    expect(health?.text).toMatch(/last activity/);
  });

  it('tolerates a single failed poll without declaring the plane stale', async () => {
    // Polls fail transiently. Shouting on the first one trains readers to ignore the line.
    let fail = false;
    const store = await withCatalog({
      getFleet: async () => {
        if (fail) throw new Error('timeout');
        return snapshot({ topics: [fleetTopic({ topic: 'orders:create', invocations: 1 })] });
      },
    });
    await store.dispatch(probeFleet());

    fail = true;
    store.dispatch(clockTicked(T0 + FLEET_POLL_MS));
    await store.dispatch(probeFleet());

    expect(selectFeedHealth(store.getState())?.kind).toBe('ok');
  });

  it('declares the data stale once failures outlast three poll intervals', async () => {
    const store = await withCatalog({ getFleet: async () => snapshot() });
    store.dispatch(fleetObserved(snapshot({ topics: [fleetTopic({ topic: 'orders:create', invocations: 1 })] })));

    const store2 = store;
    store2.dispatch(clockTicked(T0 + 4 * FLEET_POLL_MS));
    // A failure recorded after the last success, more than three intervals on from it.
    store2.dispatch({ type: 'fleet/probe/rejected', error: { message: 'timeout' } });

    const health = selectFeedHealth(store2.getState());
    expect(health?.kind).toBe('bad');
    expect(health?.text).toMatch(/the live data shown is stale/);
  });

  it('does not date a failure that arrives before the clock has ever ticked', async () => {
    // `now` starts at 0. Stamping a failure with it would date it to 1970 and make every age absurd.
    const store = createStore(
      fakeMeshApi({
        getFleet: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    );
    await store.dispatch(probeFleet());
    expect(store.getState().fleet.lastFailAt).toBeNull();
  });
});

/**
 * "Unreachable" was a diagnosis, and usually the wrong one. A collector answering `not-found` —
 * because `data-fleet-url` points at a Benzene service that never registered the mesh query handler
 * — is entirely reachable, and so is one answering a body this build cannot parse. Those are the two
 * most common wiring mistakes a platform engineer will actually make, and both used to send them to
 * security groups and DNS for an hour when the fix is one line of handler registration.
 */
describe('the feed names what answered, rather than diagnosing the network', () => {
  it('quotes the collector’s own refusal instead of calling it unreachable', async () => {
    const store = await withCatalog({
      getFleet: async () => { throw new Error("collector answered 'not-found' for benzene:mesh:query:fleet"); },
    });
    await store.dispatch(probeFleet());
    store.dispatch(clockTicked(T0 + 8_000));

    const health = selectFeedHealth(store.getState());
    expect(health?.text).toContain("collector answered 'not-found'");
    expect(health?.text).not.toContain('unreachable');
    // Still says the part that IS true regardless of cause.
    expect(health?.text).toMatch(/no successful poll yet/);
  });

  it('still says unreachable when there is no reason to quote', async () => {
    const store = await withCatalog({ getFleet: async () => { throw new Error(''); } });
    await store.dispatch(probeFleet());
    store.dispatch(clockTicked(T0 + 8_000));
    expect(selectFeedHealth(store.getState())?.text).toContain('unreachable');
  });
});
