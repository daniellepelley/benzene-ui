import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { manifestRefreshed, type MeshApi } from './slices/estateSlice';
import { fakeMeshApi } from '../test/fakeMeshApi';
import { probeFleet, fleetObserved, clockTicked, HEARTBEAT_STALE_MS } from './slices/fleetSlice';
import { fleetView, fleetService, meshIssue } from '../test/fleetView';
import type { FleetView } from '../contracts';
import {
  selectLiveness,
  selectDivergences,
  selectIssueSummary,
  selectIssuesForService,
  selectFleetLoad,
} from './selectors';

const T0 = Date.parse('2026-07-16T09:15:00Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

const snapshot = (over: Partial<FleetView> = {}): FleetView =>
  fleetView({
    generatedAt: at(0),
    services: [fleetService({ service: 'orders-api', health: 'healthy', lastSeen: at(0) })],
    ...over,
  });

const api = (over: Partial<MeshApi> = {}): MeshApi => fakeMeshApi(over);

const withEstate = (store: ReturnType<typeof createStore>) =>
  store.dispatch(
    manifestRefreshed({
      generatedAtUtc: at(0),
      services: [
        { name: 'orders-api', status: 'healthy', contractDrift: false },
        { name: 'payments-api', status: 'healthy', contractDrift: false },
        { name: 'never-reported', status: 'healthy', contractDrift: false },
      ],
    }),
  );

describe('fleet availability', () => {
  it('no collector wired is a resting state, not a failure', async () => {
    // getFleet absent entirely — the estate must still render, and nothing may look broken.
    const store = createStore(api());

    await store.dispatch(probeFleet());

    expect(selectFleetLoad(store.getState())).toBe('unavailable');
    expect(store.getState().fleet.available).toBe(false);
    expect(store.getState().fleet.error).toBeNull();
  });

  it('a collector that errors is unavailable, and says why', async () => {
    const store = createStore(
      api({
        getFleet: async () => {
          throw new Error('collector unreachable');
        },
      }),
    );

    await store.dispatch(probeFleet());

    expect(store.getState().fleet.available).toBe(false);
    expect(store.getState().fleet.error).toBe('collector unreachable');
  });

  it('a live collector flips availability and holds the observation', async () => {
    const store = createStore(api({ getFleet: async () => snapshot() }));

    await store.dispatch(probeFleet());

    expect(store.getState().fleet.available).toBe(true);
    expect(selectFleetLoad(store.getState())).toBe('live');
    expect(store.getState().fleet.generatedAt).toBe(at(0));
  });

  it('polling does not re-enter probing', async () => {
    const store = createStore(api({ getFleet: async () => snapshot() }));
    await store.dispatch(probeFleet());

    store.dispatch(fleetObserved(snapshot({ generatedAt: at(5000) })));

    expect(selectFleetLoad(store.getState())).toBe('live');
    expect(store.getState().fleet.generatedAt).toBe(at(5000));
  });
});

describe('liveness', () => {
  it('is live inside the staleness window and stale beyond it', () => {
    const store = createStore(api());
    store.dispatch(fleetObserved(snapshot()));

    store.dispatch(clockTicked(T0 + HEARTBEAT_STALE_MS - 1));
    expect(selectLiveness(store.getState(), 'orders-api')).toBe('live');

    store.dispatch(clockTicked(T0 + HEARTBEAT_STALE_MS + 1));
    expect(selectLiveness(store.getState(), 'orders-api')).toBe('stale');
  });

  it('distinguishes never-reported from stale', () => {
    // A service with no reporting middleware wired has never sent a heartbeat, and a plane with no
    // live-time signal omits lastSeen entirely. Painting either as "stale" accuses a perfectly
    // healthy service of being silent.
    const store = createStore(api());
    store.dispatch(fleetObserved(snapshot()));
    store.dispatch(clockTicked(T0 + HEARTBEAT_STALE_MS * 10));

    expect(selectLiveness(store.getState(), 'never-reported')).toBe('silent');
  });
});

describe('divergence — declared healthy, observed silent', () => {
  it('is the thing the two planes exist to reveal', () => {
    const store = createStore(api());
    withEstate(store);
    store.dispatch(fleetObserved(snapshot()));
    store.dispatch(clockTicked(T0 + HEARTBEAT_STALE_MS + 1));

    // orders-api declared healthy but its heartbeat has aged out.
    expect(selectDivergences(store.getState())).toEqual(['orders-api']);
  });

  it('is not triggered by a plane that carries no live-time signal at all', () => {
    // The composite plane's anonymous rows omit lastSeen by design. An absent signal is not evidence
    // of silence — an earlier version serialised it as 0001-01-01 and lit every service red.
    const store = createStore(api());
    withEstate(store);
    store.dispatch(fleetObserved(fleetView({ services: [fleetService({ service: 'orders-api' })] })));
    store.dispatch(clockTicked(T0 + HEARTBEAT_STALE_MS * 10));

    expect(selectDivergences(store.getState())).toEqual([]);
    expect(selectLiveness(store.getState(), 'orders-api')).toBe('silent');
  });

  it('reports nothing when there is no live plane to compare against', () => {
    // Without a collector, every service is "declared healthy, never observed". Reporting all of
    // them as divergent would make the feature useless the moment it is unconfigured.
    const store = createStore(api());
    withEstate(store);
    store.dispatch(clockTicked(T0 + HEARTBEAT_STALE_MS * 10));

    expect(selectDivergences(store.getState())).toEqual([]);
  });
});

describe('issues', () => {
  const issues = [
    meshIssue({ fingerprint: 'a', service: 'orders-api', classification: 'exception', lastSeen: at(1000), count: 400 }),
    meshIssue({ fingerprint: 'b', service: 'orders-api', classification: 'validation', lastSeen: at(3000), count: 1 }),
    meshIssue({ fingerprint: 'c', service: 'payments-api', classification: 'exception', lastSeen: at(2000), count: 2 }),
  ];

  it('counts occurrences, not distinct issues', () => {
    // One issue seen 400 times is a bigger problem than four seen once.
    const store = createStore(api());
    store.dispatch(fleetObserved(snapshot({ issues })));

    const summary = selectIssueSummary(store.getState());
    expect(summary.distinct).toBe(3);
    expect(summary.occurrences).toBe(403);
    expect(summary.byClassification).toEqual({ exception: 402, validation: 1 });
  });

  it('returns one service’s issues, newest first', () => {
    const store = createStore(api());
    store.dispatch(fleetObserved(snapshot({ issues })));

    expect(selectIssuesForService(store.getState(), 'orders-api').map((i) => i.fingerprint)).toEqual(['b', 'a']);
  });
});
