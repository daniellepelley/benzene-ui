import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadManifest } from './slices/estateSlice';
import { loadCatalog } from './slices/catalogSlice';
import { probeFleet, clockTicked, fleetObserved } from './slices/fleetSlice';
import { MeshFetchError } from './slices/estateSlice';
import { fleetView, fleetService, fleetTopic } from '../test/fleetView';
import { fakeMeshApi } from '../test/fakeMeshApi';
import { selectSetup, selectSetupItems, selectSetupAttention } from './setup';
import type { CapabilitiesState } from './slices/capabilitiesSlice';

const T0 = Date.parse('2026-09-08T09:00:00Z');

const caps = (over: Partial<CapabilitiesState> = {}): CapabilitiesState => ({
  fleet: false, invoke: false, refresh: false, manifestUrl: null, logoutUrl: null, environment: null, ...over,
});

const item = (store: ReturnType<typeof createStore>, id: string) =>
  selectSetupItems(store.getState()).find((i) => i.id === id)!;

/**
 * The Setup page is where every "this is not wired" sentence went, so the thing to prove is the
 * classification: what is merely NOT WIRED (ordinary, never counted), what is FAILING (someone has
 * to act), what is DEGRADED (wired, answering, with a caveat), and that the nav badge counts only
 * the last two. A partial mesh that is working as configured must show no number at all.
 */
describe('setup: a partial mesh is not a broken one', () => {
  it('lists an unwired live plane, dispatch, refresh, sign-in and environment as off — and counts none of them', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    await store.dispatch(probeFleet());

    for (const id of ['live', 'dispatch', 'refresh', 'session', 'environment']) {
      expect(item(store, id).state, id).toBe('off');
    }
    expect(selectSetupAttention(store.getState())).toEqual({ attention: 0, worst: null });
  });

  it('reports the catalog and the three artifacts as ready once they load', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());

    expect(item(store, 'catalog').state).toBe('ready');
    expect(item(store, 'catalog').detail).toMatch(/3 services/);
    expect(item(store, 'topics').state).toBe('ready');
    expect(item(store, 'topology').state).toBe('ready');
    expect(item(store, 'usage').state).toBe('ready');
  });

  it('files a 404 on usage.json as not wired, not as failing', async () => {
    // An aggregator with no usage source publishes no usage.json. That is the ordinary shape of a
    // partial mesh, and it must not light the badge.
    const store = createStore(fakeMeshApi({
      getUsage: async () => { throw new MeshFetchError('404 Not Found for usage.json', 404); },
    }));
    await store.dispatch(loadCatalog());

    expect(item(store, 'usage').state).toBe('off');
    expect(item(store, 'usage').detail).toMatch(/not published/);
    expect(selectSetupAttention(store.getState()).attention).toBe(0);
  });

  it('files any other read failure as failing, keeps the reason, and counts it', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => { throw new MeshFetchError('503 Service Unavailable for topics.json', 503); },
    }));
    await store.dispatch(loadCatalog());

    expect(item(store, 'topics').state).toBe('failing');
    expect(item(store, 'topics').detail).toBe('503 Service Unavailable for topics.json');
    expect(selectSetupAttention(store.getState())).toEqual({ attention: 1, worst: 'failing' });
  });

  it('reports a manifest that could not be loaded as failing, with the reason', async () => {
    const store = createStore(fakeMeshApi({
      getManifest: async () => { throw new MeshFetchError('500 Internal Server Error for manifest.json', 500); },
    }));
    await store.dispatch(loadManifest());

    expect(item(store, 'catalog').state).toBe('failing');
    expect(item(store, 'catalog').detail).toMatch(/500/);
  });

  it('reports a first-run mesh as pending, not failing — nothing has been published yet', async () => {
    const store = createStore(fakeMeshApi({
      getManifest: async () => { throw new MeshFetchError('404 Not Found for manifest.json', 404); },
    }));
    await store.dispatch(loadManifest());

    expect(item(store, 'catalog').state).toBe('pending');
    expect(selectSetupAttention(store.getState()).attention).toBe(0);
  });
});

describe('setup: the live plane', () => {
  it('is failing, with the poll error, when it is wired and has never answered', async () => {
    const store = createStore(
      fakeMeshApi({ getFleet: async () => { throw new Error('ECONNREFUSED'); } }),
      { capabilities: caps({ fleet: true }) },
    );
    await store.dispatch(loadCatalog());
    store.dispatch(clockTicked(T0));
    await store.dispatch(probeFleet());

    expect(item(store, 'live').state).toBe('failing');
    expect(item(store, 'live').detail).toMatch(/ECONNREFUSED/);
    expect(selectSetupAttention(store.getState()).worst).toBe('failing');
  });

  it('is degraded, not ready, when it answers but has never seen traffic', async () => {
    // Blind. Silence from a broken exporter looks exactly like silence from an idle estate.
    const store = createStore(
      fakeMeshApi({ getFleet: async () => fleetView({ generatedAt: '2026-09-08T09:00:00Z' }) }),
      { capabilities: caps({ fleet: true }) },
    );
    await store.dispatch(loadCatalog());
    store.dispatch(clockTicked(T0));
    await store.dispatch(probeFleet());

    expect(item(store, 'live').state).toBe('degraded');
    expect(item(store, 'live').detail).toMatch(/check the exporter wiring/);
    expect(selectSetupAttention(store.getState())).toEqual({ attention: 1, worst: 'degraded' });
  });

  it('is ready once real traffic has been observed', async () => {
    const store = createStore(
      fakeMeshApi({
        getFleet: async () => fleetView({
          generatedAt: '2026-09-08T09:00:00Z',
          topics: [fleetTopic({ topic: 'orders:create', invocations: 12 })],
        }),
      }),
      { capabilities: caps({ fleet: true }) },
    );
    await store.dispatch(loadCatalog());
    store.dispatch(clockTicked(T0));
    await store.dispatch(probeFleet());

    expect(item(store, 'live').state).toBe('ready');
    expect(selectSetupAttention(store.getState()).attention).toBe(0);
  });
});

describe('setup: per-service participation', () => {
  it('shows, per service, which of the mesh’s feeds it is supplying', async () => {
    const store = createStore(fakeMeshApi(), { capabilities: caps({ fleet: true }) });
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    store.dispatch(clockTicked(T0));
    store.dispatch(fleetObserved(fleetView({
      generatedAt: '2026-09-08T09:00:00Z',
      services: [
        fleetService({ service: 'orders-api', health: 'healthy', lastSeen: '2026-09-08T08:59:55Z' }),
        fleetService({ service: 'payments-api', health: 'healthy', missingFeeds: ['health'] }),
        fleetService({ service: 'ghost-svc', health: 'healthy', lastSeen: '2026-09-08T08:59:55Z' }),
      ],
    })));

    const setup = selectSetup(store.getState());
    const rows = Object.fromEntries(setup.services.map((r) => [r.name, r]));

    // Reporting, catalogued, reachable: nothing to do.
    expect(rows['orders-api']!.live).toBe('live');
    expect(rows['orders-api']!.hints).toEqual([]);
    // Never heartbeated, and the collector declares no health feed for it: both named, as hints.
    expect(rows['payments-api']!.live).toBe('silent');
    expect(rows['payments-api']!.missingFeeds).toEqual(['health']);
    expect(rows['payments-api']!.hints.join(' ')).toMatch(/Never reported to the collector/);
    expect(rows['payments-api']!.hints.join(' ')).toMatch(/no health feed/);
    // Reporting but never catalogued: listed apart, because the fix is on the aggregator's side.
    expect(setup.undeclared).toEqual(['ghost-svc']);
  });

  it('names an unreachable service as one the aggregator could not reach', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());

    const unreachable = selectSetup(store.getState()).services.find((r) => !r.reachable)!;
    expect(unreachable).toBeDefined();
    expect(unreachable.hints.join(' ')).toMatch(/could not reach it/);
  });

  it('leaves the reporting column unobservable, not silent, when no live plane is wired', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    await store.dispatch(probeFleet());

    for (const row of selectSetup(store.getState()).services) {
      expect(row.live).toBeNull();
      expect(row.hints.join(' ')).not.toMatch(/Never reported/);
    }
  });

  it('marks topic participation unknown, not absent, when the topics feed could not be read', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => { throw new MeshFetchError('503 for topics.json', 503); },
    }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());

    for (const row of selectSetup(store.getState()).services) expect(row.declares).toBeNull();
  });
});
