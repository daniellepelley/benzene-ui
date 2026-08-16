import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { probeFleet, fleetObserved, relativeFrom } from './slices/fleetSlice';
import { fleetView, fleetTopic } from '../test/fleetView';
import type { FleetView, Topics } from '../contracts';
import liveness from '../../contracts/artifacts/topics.liveness.json';
import { rangeChanged, topicVersionSelected } from './slices/viewSlice';
import { selectLiveForTopic, selectRangeMs, rangeLabel, RANGE_OPTIONS } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const snapshot = (over: Partial<FleetView> = {}): FleetView =>
  fleetView({ generatedAt: '2026-08-09T06:00:00Z', ...over });

describe('the live window', () => {
  it('is sent to the collector on every poll', async () => {
    // A collector answering over a window other than the one the UI is labelling would put a
    // truthful-looking number under a false heading. The window has to travel with the question.
    const getFleet = vi.fn(async () => snapshot());
    const store = createStore(fakeMeshApi({ getFleet }));

    await store.dispatch(probeFleet());

    expect(getFleet).toHaveBeenCalledWith({ window: { from: 'now-15m' } });
  });

  it('sends the new window after the reader changes it', async () => {
    const getFleet = vi.fn(async () => snapshot());
    const store = createStore(fakeMeshApi({ getFleet }));

    store.dispatch(rangeChanged(24 * 60 * 60_000));
    await store.dispatch(probeFleet());

    expect(selectRangeMs(store.getState())).toBe(24 * 60 * 60_000);
    expect(getFleet).toHaveBeenLastCalledWith({ window: { from: 'now-1d' } });
  });

  it('asks in the wire\'s relative-time grammar, not in resolved timestamps', () => {
    // The server resolves `now-1h` against its own clock. Sending a resolved instant instead would
    // silently shift the window by whatever the client's clock skew happens to be.
    expect(relativeFrom(15 * 60_000)).toBe('now-15m');
    expect(relativeFrom(60 * 60_000)).toBe('now-1h');
    expect(relativeFrom(6 * 60 * 60_000)).toBe('now-6h');
    expect(relativeFrom(24 * 60 * 60_000)).toBe('now-1d');
  });

  it('names every window it offers', () => {
    for (const option of RANGE_OPTIONS) {
      expect(rangeLabel(option.ms)).toBe(option.label);
    }
    // A window set from outside the picker still gets a sane label rather than a raw millisecond count.
    expect(rangeLabel(5 * 60_000)).toBe('5 minutes');
  });
});

describe('the live plane for one topic', () => {
  const ready = async () => {
    const store = createStore(fakeMeshApi({ getFleet: async () => snapshot() }));
    await store.dispatch(loadCatalog());
    return store;
  };

  it('reports nothing at all when no collector is wired', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(probeFleet());
    expect(selectLiveForTopic(store.getState(), 'orders:create').available).toBe(false);
  });

  it('distinguishes "nothing in this window" from zero', async () => {
    // Zero is a measurement. Absence of rows is not — the collector may simply not have looked here,
    // and the difference decides whether a reader goes hunting for a dead service.
    const store = await ready();
    store.dispatch(fleetObserved(snapshot()));
    expect(selectLiveForTopic(store.getState(), 'orders:create').observed).toBeNull();
  });

  it('sums across every service handling the topic AT THE VERSION ON SCREEN', async () => {
    // Summing across services is right; summing across versions is not. The page defaults to the
    // newest version when none is pinned, so an unpinned arrival must report the newest version's
    // numbers — not the whole topic's under the newest version's heading.
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          topics: [
            fleetTopic({ topic: 'orders:create', version: 'v2', invocations: 30, errors: 1, consumers: ['orders-api'] }),
            fleetTopic({ topic: 'orders:create', version: 'v2', invocations: 25, errors: 0, consumers: ['orders-worker'] }),
            fleetTopic({ topic: 'orders:create', version: 'v1', invocations: 100, errors: 4, consumers: ['legacy-api'] }),
            fleetTopic({ topic: 'payment:capture', invocations: 9, consumers: ['payments-api'] }),
          ],
        }),
      ),
    );

    const live = selectLiveForTopic(store.getState(), 'orders:create');
    expect(live.observed).toBe(55);
    expect(live.errors).toBe(1);
    expect(live.registeredHandlers).toEqual(['orders-api', 'orders-worker']);
  });

  /**
   * The defect this replaced an assertion for. `selectTopic` defaults to the newest entry when no
   * version is pinned; the traffic selectors keyed off the URL's version, which on that same arrival
   * is null, so they merged every version under the newest one's heading. On a mid-deployment estate
   * that reported a version which had carried nothing as flowing cleanly — a rollout that had not
   * started, rendered as deployed. Reachable by bookmark, typed URL or runbook step, which is how an
   * operator arrives on a release morning.
   */
  it('never reports an older version’s traffic under the newest version’s heading', async () => {
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          topics: [
            fleetTopic({ topic: 'orders:create', version: 'v1', invocations: 9840, errors: 0 }),
            fleetTopic({ topic: 'orders:create', version: 'v2', invocations: 0, errors: 0 }),
          ],
        }),
      ),
    );

    // No version pinned: the page shows v2, so the strip must show v2's zero.
    expect(selectLiveForTopic(store.getState(), 'orders:create').observed).toBe(0);

    store.dispatch(topicVersionSelected('v1'));
    expect(selectLiveForTopic(store.getState(), 'orders:create').observed).toBe(9840);
  });

  it('renders a dimension the plane cannot supply as unknown, never as zero', async () => {
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          topics: [fleetTopic({ topic: 'orders:create', invocations: 40, missingFeeds: ['duration'] })],
        }),
      ),
    );

    const live = selectLiveForTopic(store.getState(), 'orders:create');
    expect(live.observed).toBe(40);
    expect(live.avgDurationMs).toBeNull();
    expect(live.missingFeeds).toEqual(['duration']);
  });

  it('weights the average duration by traffic, so a quiet version cannot skew a busy one', async () => {
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          topics: [
            fleetTopic({ topic: 'orders:create', version: 'v2', invocations: 999, avgDurationMs: 10 }),
            fleetTopic({ topic: 'orders:create', version: 'v2', invocations: 1, avgDurationMs: 1000 }),
          ],
        }),
      ),
    );

    // Two services on the SAME version. An unweighted mean would report 505ms for a version that is
    // almost entirely 10ms.
    expect(selectLiveForTopic(store.getState(), 'orders:create').avgDurationMs).toBeCloseTo(10.99, 1);
  });

  it('says when the counts answer a different window than the flows', async () => {
    // A push-collector plane's counters are cumulative since process start; a composite plane's come
    // from the usage feed's baked window. Either way the picked window's label would be a lie.
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          topics: [fleetTopic({ topic: 'orders:create', invocations: 148320 })],
          window: {
            from: '2026-08-09T05:45:00Z',
            to: '2026-08-09T06:00:00Z',
            countsWindowed: false,
            countsSince: '2026-08-08T06:00:00Z',
          },
        }),
      ),
    );

    expect(selectLiveForTopic(store.getState(), 'orders:create').countsSince).toBe('2026-08-08T06:00:00Z');
  });

  it('does not badge the counts when they do honour the picked window', async () => {
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          topics: [fleetTopic({ topic: 'orders:create', invocations: 12 })],
          window: { from: '2026-08-09T05:45:00Z', to: '2026-08-09T06:00:00Z', countsWindowed: true },
        }),
      ),
    );

    expect(selectLiveForTopic(store.getState(), 'orders:create').countsSince).toBeNull();
  });

  it('carries the window label with the figure, not beside it', async () => {
    const store = await ready();
    store.dispatch(rangeChanged(60 * 60_000));
    store.dispatch(fleetObserved(snapshot({ topics: [fleetTopic({ topic: 'orders:create', invocations: 3 })] })));

    expect(selectLiveForTopic(store.getState(), 'orders:create').rangeLabel).toBe('1 hour');
  });
});

/**
 * Three facts, three feeds, and the entire question "has the right thing been deployed?" lives in
 * the gaps between them. `declared` is what a service's spec endpoint said when it was polled;
 * `registered` is what a running instance told the collector; `observed` is traffic that crossed
 * the edge. The strip printed the second under the word "observed" — with a tooltip insisting it
 * was not a declaration — directly beneath `observed 0`.
 */
describe('declared, registered and observed are three different statements', () => {
  // The liveness catalogue is the one that carries the per-edge activity signal at all.
  const ready = async () => {
    const store = createStore(fakeMeshApi({
      getFleet: async () => snapshot(),
      getTopics: async () => liveness as unknown as Topics,
    }));
    await store.dispatch(loadCatalog());
    return store;
  };

  it('reads the observed set from the per-edge activity, not from the registration list', async () => {
    const store = await ready();
    store.dispatch(fleetObserved(snapshot({
      // The plane says two services are REGISTERED. The catalogue has traced only one of them.
      topics: [fleetTopic({
        topic: 'shipping:book', invocations: 10, consumers: ['shipping-api', 'archive-api'],
      })],
    })));

    const live = selectLiveForTopic(store.getState(), 'shipping:book');
    expect(live.registeredHandlers).toEqual(['archive-api', 'shipping-api']);
    expect(live.activityWired).toBe(true);
    expect(live.observedHandlers).toEqual(['shipping-api']);
    // Which is the whole point: a registration that has never carried traffic is exactly the signal
    // a mid-deployment estate turns on, and it used to be printed as an observation.
    expect(live.observedHandlers).not.toContain('archive-api');
  });

  it('separates "no traffic traced" from "this aggregator does not publish traffic"', async () => {
    const store = await ready();
    store.dispatch(fleetObserved(snapshot({
      topics: [fleetTopic({ topic: 'no:such-topic', consumers: ['ghost-api'] })],
    })));

    // A topic the catalogue does not carry has no activity signal at all — unknown, not idle.
    const live = selectLiveForTopic(store.getState(), 'no:such-topic');
    expect(live.activityWired).toBe(false);
    expect(live.observedHandlers).toEqual([]);
  });
});
