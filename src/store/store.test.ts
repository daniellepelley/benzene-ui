import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadManifest, loadService, manifestRefreshed, type MeshApi } from './slices/estateSlice';
import { filterChanged, serviceToggled, navigated, allCollapsed } from './slices/viewSlice';
import {
  selectVisibleServices,
  selectEstateSummary,
  selectExpandedCount,
  ragForStatus,
} from './selectors';
import type { Manifest, ServiceSnapshot } from '../contracts';

const MANIFEST: Manifest = {
  generatedAtUtc: '2026-07-16T09:15:00Z',
  services: [
    { name: 'orders-api', status: 'healthy', contractDrift: false },
    { name: 'payments-api', status: 'unhealthy', contractDrift: true },
    { name: 'shipping-api', status: 'unreachable', contractDrift: false },
  ],
};

const stubApi = (over: Partial<MeshApi> = {}): MeshApi => ({
  getManifest: async () => MANIFEST,
  getService: async (name) =>
    ({
      name,
      fetchedAtUtc: '2026-07-16T09:15:00Z',
      specJson: null,
      specHash: null,
      previousSpecHash: null,
      contractDrift: false,
      health: null,
      error: null,
    }) as ServiceSnapshot,
  ...over,
});

describe('estate', () => {
  it('moves idle → loading → ready, and holds the manifest', async () => {
    const store = createStore(stubApi());
    expect(store.getState().estate.load).toBe('idle');

    const pending = store.dispatch(loadManifest());
    expect(store.getState().estate.load).toBe('loading');

    await pending;
    expect(store.getState().estate.load).toBe('ready');
    expect(store.getState().estate.services).toHaveLength(3);
    expect(store.getState().estate.generatedAtUtc).toBe('2026-07-16T09:15:00Z');
  });

  it('records the reason when the manifest cannot be loaded', async () => {
    const store = createStore(
      stubApi({
        getManifest: async () => {
          throw new Error('Connection refused');
        },
      }),
    );

    await store.dispatch(loadManifest());

    expect(store.getState().estate.load).toBe('failed');
    // The message survives to the UI: "failed" alone tells an operator nothing actionable.
    expect(store.getState().estate.error).toBe('Connection refused');
  });

  it('refreshes the declared plane without going back through loading', async () => {
    // The live poll must not make the whole estate flicker every few seconds.
    const store = createStore(stubApi());
    await store.dispatch(loadManifest());

    store.dispatch(
      manifestRefreshed({
        generatedAtUtc: '2026-07-16T09:20:00Z',
        services: [{ name: 'orders-api', status: 'degraded', contractDrift: false }],
      }),
    );

    expect(store.getState().estate.load).toBe('ready');
    expect(store.getState().estate.services).toHaveLength(1);
    expect(store.getState().estate.services[0]?.status).toBe('degraded');
  });

  it('tracks per-service load state independently', async () => {
    const store = createStore(stubApi());
    await store.dispatch(loadService('orders-api'));

    expect(store.getState().estate.snapshotLoad['orders-api']).toBe('ready');
    expect(store.getState().estate.snapshotLoad['payments-api']).toBeUndefined();
    expect(store.getState().estate.snapshots['orders-api']?.name).toBe('orders-api');
  });
});

describe('view state', () => {
  it('filters the estate by name, case-insensitively', async () => {
    const store = createStore(stubApi());
    await store.dispatch(loadManifest());

    store.dispatch(filterChanged('API'));
    expect(selectVisibleServices(store.getState())).toHaveLength(3);

    store.dispatch(filterChanged('  Payments '));
    expect(selectVisibleServices(store.getState()).map((s) => s.name)).toEqual(['payments-api']);

    store.dispatch(filterChanged(''));
    expect(selectVisibleServices(store.getState())).toHaveLength(3);
  });

  it('toggles a service open and closed', () => {
    const store = createStore(stubApi());

    store.dispatch(serviceToggled('orders-api'));
    expect(selectExpandedCount(store.getState())).toBe(1);

    store.dispatch(serviceToggled('payments-api'));
    expect(selectExpandedCount(store.getState())).toBe(2);

    store.dispatch(serviceToggled('orders-api'));
    expect(store.getState().view.expandedServices).toEqual(['payments-api']);
  });

  it('collapses everything at once', () => {
    const store = createStore(stubApi());
    store.dispatch(serviceToggled('a'));
    store.dispatch(serviceToggled('b'));

    store.dispatch(allCollapsed());

    expect(selectExpandedCount(store.getState())).toBe(0);
  });

  it('navigating carries the entity it is about', () => {
    const store = createStore(stubApi());
    store.dispatch(navigated({ page: 'service', selected: 'orders-api' }));
    expect(store.getState().view).toMatchObject({ page: 'service', selected: 'orders-api' });

    // Going back to the fleet clears the selection rather than leaving it dangling.
    store.dispatch(navigated({ page: 'fleet' }));
    expect(store.getState().view.selected).toBeNull();
  });
});

describe('derived estate summary', () => {
  it('counts by RAG and reports the worst, not the most common', async () => {
    const store = createStore(stubApi());
    await store.dispatch(loadManifest());

    const summary = selectEstateSummary(store.getState());

    expect(summary.total).toBe(3);
    expect(summary.counts).toEqual({ green: 1, red: 1, gone: 1, amber: 0 });
    expect(summary.drift).toBe(1);
    // One red outranks everything else — an estate with a single dead service is not "mostly green".
    expect(summary.worst).toBe('red');
  });

  it('is memoised, so the header does not re-render on unrelated view changes', async () => {
    const store = createStore(stubApi());
    await store.dispatch(loadManifest());

    const first = selectEstateSummary(store.getState());
    store.dispatch(filterChanged('orders'));

    expect(selectEstateSummary(store.getState())).toBe(first);
  });

  it('maps every declared status to a RAG', () => {
    expect(ragForStatus('healthy')).toBe('green');
    expect(ragForStatus('degraded')).toBe('amber');
    expect(ragForStatus('unhealthy')).toBe('red');
    expect(ragForStatus('unreachable')).toBe('gone');
  });
});
