import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';
import {
  loadManifest,
  refreshEstate,
  MeshFetchError,
  type MeshApi,
} from './slices/estateSlice';
import { loadCatalog } from './slices/catalogSlice';
import { capabilitiesOf } from './slices/capabilitiesSlice';
import { fakeMeshApi } from '../test/fakeMeshApi';
import type { Manifest } from '../contracts';

/**
 * Two things a deployed mesh does that a static one never did: it can be empty, and it can be poked.
 *
 * The empty case is the one that shipped badly. A mesh deployed five minutes ago has run no
 * discovery pass, so there is no `manifest.json`, so the artifact store answers 404 — and the first
 * thing its owner saw was "404 Not Found for manifest.json". These pin the distinction that makes a
 * purposeful empty state possible without hiding a genuinely broken mesh behind it: only a 404 on
 * the manifest is "nothing published yet". A refused connection, a 500 and a body that will not
 * parse are failures, and stay failures.
 */

const MANIFEST: Manifest = {
  generatedAtUtc: '2026-08-16T09:15:00Z',
  services: [{ name: 'orders-api', status: 'healthy', contractDrift: false }],
};

const failingManifest = (error: unknown): MeshApi =>
  fakeMeshApi({
    getManifest: async () => {
      throw error;
    },
  });

describe('a mesh that has published nothing yet', () => {
  it('reads a 404 on the manifest as an empty catalog, not as an error', async () => {
    const store = createStore(failingManifest(new MeshFetchError('404 Not Found for manifest.json', 404)));

    await store.dispatch(loadManifest());

    expect(store.getState().estate.load).toBe('empty');
    // No error, because nothing is wrong. An error here is what put a 404 on the reader's screen.
    expect(store.getState().estate.error).toBeNull();
  });

  it('leaves a 500 as a real failure — a broken mesh must not read as a new one', async () => {
    const store = createStore(
      failingManifest(new MeshFetchError('500 Internal Server Error for manifest.json', 500)),
    );

    await store.dispatch(loadManifest());

    expect(store.getState().estate.load).toBe('failed');
    expect(store.getState().estate.error).toBe('500 Internal Server Error for manifest.json');
  });

  it('leaves a network failure as a real failure — it answered nothing, not "nothing yet"', async () => {
    // What `fetch` throws when the host is unreachable: no status at all.
    const store = createStore(failingManifest(new TypeError('Failed to fetch')));

    await store.dispatch(loadManifest());

    expect(store.getState().estate.load).toBe('failed');
    expect(store.getState().estate.error).toBe('Failed to fetch');
  });

  it('leaves a manifest that will not parse as a real failure', async () => {
    // A 200 carrying broken JSON is a publishing bug, and telling its author "no catalog yet" would
    // send them looking at the schedule instead of at the document.
    const store = createStore(failingManifest(new SyntaxError('Unexpected end of JSON input')));

    await store.dispatch(loadManifest());

    expect(store.getState().estate.load).toBe('failed');
  });

  it('leaves the empty state as soon as a manifest arrives', async () => {
    // Whether the pass came from the reader pressing Refresh or from the artifact poll, the arrival
    // of a manifest is the end of "nothing published yet".
    let published = false;
    const store = createStore(
      fakeMeshApi({
        requestRefresh: async () => {
          published = true;
        },
        getManifest: async () => {
          if (!published) throw new MeshFetchError('404 Not Found for manifest.json', 404);
          return MANIFEST;
        },
      }),
    );
    await store.dispatch(loadManifest());
    expect(store.getState().estate.load).toBe('empty');

    await store.dispatch(refreshEstate());

    expect(store.getState().estate.load).toBe('ready');
    expect(store.getState().estate.services.map((s) => s.name)).toEqual(['orders-api']);
  });
});

describe('asking the mesh to run a pass now', () => {
  const withRefresh = (requestRefresh: MeshApi['requestRefresh'], over: Partial<MeshApi> = {}) =>
    createStore(fakeMeshApi({ requestRefresh, ...over }));

  it('re-reads the artifacts, because the point of the button is the new data', async () => {
    // The POST only starts the pass. A refresh that stopped there would leave the reader looking at
    // the same page and concluding the button does nothing.
    const getManifest = vi.fn(async () => MANIFEST);
    const getTopics = vi.fn(fakeMeshApi().getTopics);
    const store = withRefresh(async () => {}, { getManifest, getTopics });
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());

    await store.dispatch(refreshEstate());

    expect(getManifest).toHaveBeenCalledTimes(2);
    expect(getTopics).toHaveBeenCalledTimes(2);
    expect(store.getState().estate.refresh).toBe('idle');
    expect(store.getState().estate.refreshNote).toBeNull();
  });

  it('is in flight while it runs, so the control can refuse a second click', async () => {
    const store = withRefresh(() => new Promise<void>(() => {}));

    void store.dispatch(refreshEstate());

    expect(store.getState().estate.refresh).toBe('refreshing');
  });

  it('reads a 429 as "not yet", not as a fault', async () => {
    // The server rate-limits refreshes on purpose. Rendering its "no" in red would teach a reader to
    // ignore red, which is the one thing this product cannot afford.
    const store = withRefresh(async () => {
      throw new MeshFetchError('429 Too Many Requests for /refresh', 429);
    });

    await store.dispatch(refreshEstate());

    expect(store.getState().estate.refresh).toBe('throttled');
    expect(store.getState().estate.refreshNote).toBe('Refreshed recently — try again shortly.');
  });

  it('reads a 401 as an expired session, which retrying cannot fix', async () => {
    const store = withRefresh(async () => {
      throw new MeshFetchError('401 Unauthorized for /refresh', 401);
    });

    await store.dispatch(refreshEstate());

    expect(store.getState().estate.refresh).toBe('expired');
    expect(store.getState().estate.refreshNote).toMatch(/sign in again/);
  });

  it('reports anything else as a failure, in the mesh’s own words', async () => {
    const store = withRefresh(async () => {
      throw new MeshFetchError('503 Service Unavailable for /refresh', 503);
    });

    await store.dispatch(refreshEstate());

    expect(store.getState().estate.refresh).toBe('failed');
    expect(store.getState().estate.refreshNote).toBe('503 Service Unavailable for /refresh');
  });

  it('never wipes the estate it failed to refresh', async () => {
    // A refresh that could not start is news about the refresh, not about the estate. Blanking a
    // loaded page over one would lose the reader the data they already had.
    const store = withRefresh(async () => {
      throw new MeshFetchError('429 Too Many Requests for /refresh', 429);
    });
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    const services = store.getState().estate.services;

    await store.dispatch(refreshEstate());

    expect(store.getState().estate.load).toBe('ready');
    expect(store.getState().estate.services).toEqual(services);
    expect(store.getState().catalog.topics).not.toBeNull();
  });

  it('refuses to pretend when no refresh endpoint is wired', async () => {
    const store = createStore(fakeMeshApi());

    await store.dispatch(refreshEstate());

    expect(store.getState().estate.refresh).toBe('failed');
  });
});

describe('what the deployment says it can do', () => {
  it('reports refresh and sign-out only when the host configured them', () => {
    const bare = capabilitiesOf(fakeMeshApi());
    expect(bare.refresh).toBe(false);
    expect(bare.logoutUrl).toBeNull();

    const wired = capabilitiesOf(
      fakeMeshApi({ requestRefresh: async () => {} }),
      '/artifacts/manifest.json',
      '/benzene/auth/logout',
    );
    expect(wired.refresh).toBe(true);
    expect(wired.logoutUrl).toBe('/benzene/auth/logout');
  });
});
