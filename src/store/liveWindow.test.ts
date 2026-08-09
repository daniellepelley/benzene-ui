import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { probeFleet, fleetObserved, type FleetSnapshot } from './slices/fleetSlice';
import { rangeChanged } from './slices/viewSlice';
import { selectLiveForTopic, selectRangeMs, rangeLabel, RANGE_OPTIONS } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const snapshot = (over: Partial<FleetSnapshot> = {}): FleetSnapshot => ({
  heartbeats: [],
  issues: [],
  flows: [],
  observedAtUtc: '2026-08-09T06:00:00Z',
  ...over,
});

describe('the live window', () => {
  it('is sent to the collector on every poll', async () => {
    // A collector answering over a window other than the one the UI is labelling would put a
    // truthful-looking number under a false heading. The window has to travel with the question.
    const getFleet = vi.fn(async () => snapshot());
    const store = createStore(fakeMeshApi({ getFleet }));

    await store.dispatch(probeFleet());

    expect(getFleet).toHaveBeenCalledWith({ rangeMs: RANGE_OPTIONS[0]!.ms });
  });

  it('sends the new window after the reader changes it', async () => {
    const getFleet = vi.fn(async () => snapshot());
    const store = createStore(fakeMeshApi({ getFleet }));

    store.dispatch(rangeChanged(24 * 60 * 60_000));
    await store.dispatch(probeFleet());

    expect(selectRangeMs(store.getState())).toBe(24 * 60 * 60_000);
    expect(getFleet).toHaveBeenLastCalledWith({ rangeMs: 24 * 60 * 60_000 });
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

  it('sums success and failure across every service handling the topic', async () => {
    const store = await ready();
    store.dispatch(
      fleetObserved(
        snapshot({
          flows: [
            { topic: 'orders:create', service: 'orders-api', success: 100, failure: 4 },
            { topic: 'orders:create', service: 'orders-worker', success: 50, failure: 1 },
            { topic: 'payment:capture', service: 'payments-api', success: 9, failure: 0 },
          ],
        }),
      ),
    );

    const live = selectLiveForTopic(store.getState(), 'orders:create');
    expect(live.observed).toBe(155);
    expect(live.errors).toBe(5);
    expect(live.services).toEqual(['orders-api', 'orders-worker']);
  });

  it('carries the window label with the figure, not beside it', async () => {
    const store = await ready();
    store.dispatch(rangeChanged(60 * 60_000));
    store.dispatch(fleetObserved(snapshot({ flows: [{ topic: 'orders:create', service: 'orders-api', success: 3, failure: 0 }] })));

    expect(selectLiveForTopic(store.getState(), 'orders:create').rangeLabel).toBe('1 hour');
  });
});
