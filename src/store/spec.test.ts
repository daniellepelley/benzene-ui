import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadSpec, operationToggled, specUtilityToggled, allOperationsCollapsed } from './slices/specSlice';
import {
  selectOperations, selectUtilityOperations, selectSpecSummary, selectSpecSchemas, schemaLabel,
} from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';
import spec from '../../contracts/artifacts/spec.json';
import minimal from '../../contracts/artifacts/spec.minimal.json';
import type { ServiceSnapshot } from '../contracts';

const snapshotWith = (document: unknown): ServiceSnapshot =>
  ({
    name: 'orders-api',
    fetchedAtUtc: '2026-08-09T06:00:00Z',
    specJson: document === null ? null : JSON.stringify(document),
    specHash: null,
    previousSpecHash: null,
    contractDrift: false,
    health: null,
    error: null,
  }) as ServiceSnapshot;

const loaded = async (document: unknown = spec) => {
  const store = createStore(fakeMeshApi({ getService: async () => snapshotWith(document) }));
  await store.dispatch(loadSpec('orders-api'));
  return store;
};

describe('the service spec', () => {
  it('reads the spec out of the snapshot the aggregator stored', async () => {
    // Not from the service itself. That is the whole reason the page exists: the service serves JSON
    // and only JSON, and never has to open CORS to a dashboard.
    const store = await loaded();
    expect(store.getState().spec.load).toBe('ready');
    expect(store.getState().spec.spec?.info.title).toBe('Orders API');
  });

  it('reports a service that published no spec without failing', async () => {
    const store = await loaded(null);
    expect(store.getState().spec.load).toBe('ready');
    expect(store.getState().spec.spec).toBeNull();
  });

  it('gives a legible error for a spec that is not JSON', async () => {
    // The aggregator stores what the service published, verbatim: YAML, or HTML from a misrouted
    // proxy, are both real and neither should crash the page.
    const store = createStore(
      fakeMeshApi({ getService: async () => ({ ...snapshotWith(null), specJson: '<html>404</html>' }) }),
    );
    await store.dispatch(loadSpec('orders-api'));

    expect(store.getState().spec.load).toBe('failed');
    expect(store.getState().spec.error).toMatch(/not JSON/);
  });

  it('holds reserved topics back until the reader asks', async () => {
    // Every Benzene service carries the same utilities. A reader opening a spec is asking what THIS
    // service does, and the utilities answer a different question.
    const store = await loaded();
    expect(selectOperations(store.getState()).some((op) => op.reserved)).toBe(false);

    store.dispatch(specUtilityToggled());
    expect(selectOperations(store.getState()).some((op) => op.reserved)).toBe(true);
  });

  it('counts the utilities it is hiding, so their absence can be stated', async () => {
    const store = await loaded();
    expect(selectUtilityOperations(store.getState()).map((op) => op.topic)).toEqual([
      'benzene:spec',
      'benzene:health',
    ]);
  });

  it('summarises domain topics only', async () => {
    const store = await loaded();
    const summary = selectSpecSummary(store.getState());

    // Two domain requests, both HTTP-mapped; two events; one named schema; two utilities held back.
    expect(summary).toMatchObject({ topics: 2, httpMapped: 2, events: 2, schemas: 1, utilities: 2 });
  });

  it('surfaces how the service can actually be reached', async () => {
    const store = await loaded();
    const summary = selectSpecSummary(store.getState());
    expect(summary?.transports).toEqual(['http', 'sqs']);
    // The composer feature-detects send capability on this, so it is a capability, not a decoration.
    expect(summary?.messageEndpoint).toBe('/benzene/invoke');
  });

  it('gives each operation an id that survives two versions of one topic', async () => {
    const store = await loaded();
    const ids = selectOperations(store.getState()).map((op) => op.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('request:orders:create@v1');
    expect(ids).toContain('event:payment:capture@v2');
  });

  it('expands and collapses operations through the store', async () => {
    const store = await loaded();
    store.dispatch(operationToggled('request:orders:create@v1'));
    expect(store.getState().spec.expanded).toEqual(['request:orders:create@v1']);

    store.dispatch(operationToggled('request:orders:create@v1'));
    expect(store.getState().spec.expanded).toEqual([]);
  });

  it('forgets what was open when a different service loads', async () => {
    // Carrying expansion across documents opens whatever happens to share an id.
    const store = await loaded();
    store.dispatch(operationToggled('request:orders:create@v1'));
    await store.dispatch(loadSpec('orders-api'));
    expect(store.getState().spec.expanded).toEqual([]);
  });

  it('collapses everything at once', async () => {
    const store = await loaded();
    store.dispatch(operationToggled('request:orders:create@v1'));
    store.dispatch(operationToggled('event:payment:capture@v2'));
    store.dispatch(allOperationsCollapsed());
    expect(store.getState().spec.expanded).toEqual([]);
  });

  it('handles a service with no contract at all', async () => {
    const store = await loaded(minimal);
    expect(selectOperations(store.getState())).toEqual([]);
    expect(selectSpecSchemas(store.getState())).toEqual([]);
    expect(selectSpecSummary(store.getState())).toMatchObject({ topics: 0, utilities: 0 });
  });
});

describe('schema labels', () => {
  it('prefers the schema title, which is the name a developer would recognise', () => {
    expect(schemaLabel({ type: 'object', title: 'CreateOrder' })).toBe('CreateOrder');
  });

  it('names an array by what it contains', () => {
    expect(schemaLabel({ type: 'array', items: { type: 'object', title: 'OrderDto' } })).toBe('OrderDto[]');
    expect(schemaLabel({ type: 'array', items: { type: 'string' } })).toBe('string[]');
  });

  it('falls back to the shape word rather than inventing a name', () => {
    expect(schemaLabel({ type: 'object' })).toBe('object');
    expect(schemaLabel(null)).toBe('—');
  });
});

describe('a spec this viewer does not understand', () => {
  // A real estate has services on older Benzene versions, and benzene:spec is a topic anything can
  // answer. A viewer that white-screens on an unfamiliar document is worse than one that shows what
  // it can — and this is not hypothetical: the vendored sample carried a `{type, topics}` shape from
  // an earlier spec format, and the page crashed on it with "Cannot read properties of undefined".
  const loadedFrom = async (document: unknown) => {
    const store = createStore(
      fakeMeshApi({
        getService: async () =>
          ({ name: 'legacy-api', fetchedAtUtc: '2026-08-09T06:00:00Z', specJson: JSON.stringify(document),
             specHash: null, previousSpecHash: null, contractDrift: false, health: null, error: null }) as ServiceSnapshot,
      }),
    );
    await store.dispatch(loadSpec('legacy-api'));
    return store;
  };

  it('survives a document with no requests or events', async () => {
    const store = await loadedFrom({ type: 'benzene', topics: { 'orders:get-all': { response: 'OrderDto[]' } } });

    expect(store.getState().spec.load).toBe('ready');
    expect(selectOperations(store.getState())).toEqual([]);
    expect(selectSpecSummary(store.getState())).toMatchObject({ topics: 0, events: 0, utilities: 0 });
  });

  it('survives a document with no info block', async () => {
    const store = await loadedFrom({ requests: [], events: [] });
    expect(store.getState().spec.load).toBe('ready');
    expect(selectSpecSummary(store.getState())).not.toBeNull();
  });
});
