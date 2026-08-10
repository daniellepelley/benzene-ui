import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadManifest, manifestRefreshed } from './slices/estateSlice';
import { selectChangedServices } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';
import type { Manifest } from '../contracts';

const manifest = (services: Manifest['services']): Manifest => ({
  generatedAtUtc: '2026-08-10T09:00:00Z',
  services,
});

const AT_REST: Manifest['services'] = [
  { name: 'orders-api', status: 'healthy', contractDrift: false },
  { name: 'payments-api', status: 'healthy', contractDrift: false },
];

const loaded = async () => {
  const store = createStore(fakeMeshApi({ getManifest: async () => manifest(AT_REST) }));
  await store.dispatch(loadManifest());
  return store;
};

describe('what changed since the last refresh', () => {
  it('reports nothing on first load, however much arrived', async () => {
    // Otherwise every card on the page announces itself at once, which says nothing: "everything is
    // new" and "the page just opened" produce the same screen, and the reader learns to ignore both.
    const store = await loaded();
    expect(selectChangedServices(store.getState())).toEqual([]);
  });

  it('names the service whose status moved, and only that one', async () => {
    const store = await loaded();
    store.dispatch(
      manifestRefreshed(
        manifest([
          { name: 'orders-api', status: 'healthy', contractDrift: false },
          { name: 'payments-api', status: 'unhealthy', contractDrift: false },
        ]),
      ),
    );

    expect(selectChangedServices(store.getState())).toEqual(['payments-api']);
  });

  it('counts a service that has just appeared', async () => {
    // The arrival case. A new service showing up in an estate is exactly the event worth catching a
    // reader's eye with, and it has no previous status to differ from.
    const store = await loaded();
    store.dispatch(
      manifestRefreshed(manifest([...AT_REST, { name: 'shipping-api', status: 'healthy', contractDrift: false }])),
    );

    expect(selectChangedServices(store.getState())).toEqual(['shipping-api']);
  });

  it('clears itself on the next refresh, so nothing flashes twice', async () => {
    const store = await loaded();
    store.dispatch(
      manifestRefreshed(manifest([AT_REST[0]!, { ...AT_REST[1]!, status: 'unhealthy' }])),
    );
    expect(selectChangedServices(store.getState())).toHaveLength(1);

    store.dispatch(manifestRefreshed(manifest([AT_REST[0]!, { ...AT_REST[1]!, status: 'unhealthy' }])));
    expect(selectChangedServices(store.getState())).toEqual([]);
  });

  it('ignores a refresh that says the same thing', async () => {
    const store = await loaded();
    store.dispatch(manifestRefreshed(manifest(AT_REST)));
    expect(selectChangedServices(store.getState())).toEqual([]);
  });
});
