import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from './store';
import { loadSpec, loadSpecFromUrl, operationToggled, allOperationsCollapsed } from './slices/specSlice';
import {
  selectOperations, selectSendOperations, selectSpecSummary, selectSpecSchemas, selectContractDocument,
  selectServiceAbout, schemaLabel,
} from './selectors';
import { loadService } from './slices/estateSlice';
import { fakeMeshApi } from '../test/fakeMeshApi';
import spec from '../../contracts/artifacts/spec.json';
import legacy from '../../contracts/artifacts/spec.legacy.json';
import minimal from '../../contracts/artifacts/spec.minimal.json';
import cases from '../../contracts/contract-document-cases.json';
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

const operation = (store: Awaited<ReturnType<typeof loaded>>, id: string) =>
  [...selectOperations(store.getState()), ...selectSendOperations(store.getState())].find((op) => op.id === id)!;

describe('the service spec', () => {
  it('reads the spec out of the snapshot the aggregator stored', async () => {
    // Not from the service itself. That is the whole reason the page exists: the service serves JSON
    // and only JSON, and never has to open CORS to a dashboard.
    const store = await loaded();
    expect(store.getState().spec.load).toBe('ready');
    expect(selectContractDocument(store.getState())).toMatchObject({
      service: 'orders-api',
      serviceVersion: '2.4.0',
      description: 'Accepts and tracks customer orders through to fulfilment.',
    });
  });

  it('stores the document as published, and reads it through the one reader', async () => {
    const store = await loaded();
    expect(store.getState().spec.spec).toEqual(spec);
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

  it('refuses a schema dialect it does not know, and says which', async () => {
    // contract-document.md §1: a consumer MUST reject it. Rendering it would misread every schema.
    const store = await loaded(cases.documents.unknownDialect);
    expect(store.getState().spec.load).toBe('failed');
    expect(store.getState().spec.error).toMatch(/orders-api published a spec this viewer cannot read.*json-schema-2020-12/);
    expect(store.getState().spec.spec).toBeNull();
  });

  it('never lists benzene: topics, whichever shape listed them', async () => {
    for (const document of [spec, legacy, cases.documents.withBenzeneEntry]) {
      const store = await loaded(document);
      const topics = [...selectOperations(store.getState()), ...selectSendOperations(store.getState())].map((op) => op.topic);
      expect(topics.some((t) => t.startsWith('benzene:'))).toBe(false);
    }
  });

  it('summarises requests, events and sends', async () => {
    const store = await loaded();
    expect(selectSpecSummary(store.getState())).toMatchObject({
      topics: 3, httpMapped: 2, events: 2, sends: 2, schemas: 11, contractHash: spec.contractHash,
    });
  });

  it('surfaces how the service can actually be reached', async () => {
    const store = await loaded();
    const summary = selectSpecSummary(store.getState());
    expect(summary?.transports).toEqual(['http', 'sqs']);
    // The composer feature-detects send capability on this, so it is a capability, not a decoration.
    expect(summary?.messageEndpoint).toBe('/benzene/invoke');
  });

  it('lists requests then events as operations, and sends on their own', async () => {
    const store = await loaded();
    expect(selectOperations(store.getState()).map((op) => op.id)).toEqual([
      'request:orders:create@v1',
      'request:orders:get-all',
      'request:orders:cancel',
      'event:order:placed',
      'event:order:legacy-export',
    ]);
    expect(selectSendOperations(store.getState()).map((op) => op.id)).toEqual([
      'send:payment:capture@v2',
      'send:stock:reserve',
    ]);
  });

  it('reads an absent response as no payload, and a send without one as one-way', async () => {
    const store = await loaded();
    expect(operation(store, 'request:orders:cancel').output).toBeNull();
    expect(operation(store, 'send:payment:capture@v2').output).toBeNull();
    expect(operation(store, 'send:stock:reserve').output).toMatchObject({ title: 'StockReservation' });
  });

  it('inlines $refs so the payload names and fields are readable', async () => {
    const store = await loaded();
    const create = operation(store, 'request:orders:create@v1');
    expect(schemaLabel(create.input)).toBe('CreateOrder');
    expect(schemaLabel(create.output)).toBe('OrderCreated');
    expect(Object.keys(create.input!.properties!)).toEqual(['customerId', 'lines', 'shippingAddress']);
    expect(schemaLabel(operation(store, 'request:orders:get-all').output)).toBe('OrderDto[]');
  });

  it("shows the author's example, and otherwise a sample it says it generated", async () => {
    const store = await loaded();
    expect(operation(store, 'request:orders:create@v1')).toMatchObject({
      exampleSource: 'document',
      example: spec.requests[0]!.example,
    });
    expect(operation(store, 'request:orders:cancel')).toMatchObject({
      exampleSource: 'generated',
      example: { orderId: '00000000-0000-0000-0000-000000000000', reason: 'string' },
    });
    expect(operation(store, 'send:payment:capture@v2')).toMatchObject({
      exampleSource: 'generated',
      example: { orderId: '00000000-0000-0000-0000-000000000000', amount: 0, currency: 'string' },
    });
  });

  it('generates nothing for a request of any shape — there is nothing to sample', async () => {
    const store = await loaded({ ...minimal, requests: [{ topic: 'x:any', request: {} }] });
    expect(operation(store, 'request:x:any')).toMatchObject({ exampleSource: null, example: undefined });
  });

  it('gives each operation an id that survives two versions of one topic', async () => {
    const store = await loaded(cases.documents.versioned);
    const ids = selectOperations(store.getState()).map((op) => op.id);
    expect(ids).toEqual(['request:payments:capture@v1', 'request:payments:capture@v2', 'request:payments:refund']);
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
    store.dispatch(operationToggled('send:payment:capture@v2'));
    store.dispatch(allOperationsCollapsed());
    expect(store.getState().spec.expanded).toEqual([]);
  });

  it('handles a service with no contract at all', async () => {
    const store = await loaded(minimal);
    expect(selectOperations(store.getState())).toEqual([]);
    expect(selectSendOperations(store.getState())).toEqual([]);
    expect(selectSpecSchemas(store.getState())).toEqual([]);
    expect(selectSpecSummary(store.getState())).toMatchObject({ topics: 0, events: 0, sends: 0 });
  });

  it('lists the component schemas with their refs inlined, and a cycle left named', async () => {
    const store = await loaded(cases.documents.closure);
    const schemas = selectSpecSchemas(store.getState());
    expect(schemas.map((s) => s.name)).toContain('Unreached');
    const a = schemas.find((s) => s.name === 'A')!.schema;
    expect(a.properties!.b!.properties!.a).toEqual({ $ref: '#/components/schemas/A' });
  });
});

describe('a legacy (spec ≤ 0.2) document', () => {
  // Ports adopt a spec release at different times, so an estate serves both shapes for a while.
  it('reads its identity from info.*', async () => {
    const store = await loaded(legacy);
    expect(selectContractDocument(store.getState())).toMatchObject({ shape: 'legacy', service: 'Orders API', serviceVersion: '2.4.0' });
  });

  it('keeps its folded sends as events, and lists no sends', async () => {
    const store = await loaded(legacy);
    expect(selectOperations(store.getState()).map((op) => op.id)).toEqual([
      'request:orders:create@v1',
      'request:orders:get-all',
      'event:payment:capture@v2',
      'event:order:legacy-export',
    ]);
    expect(selectSendOperations(store.getState())).toEqual([]);
    expect(selectSpecSummary(store.getState())).toMatchObject({ topics: 2, events: 2, sends: 0, contractHash: null });
  });
});

describe("the service page's About panel", () => {
  const about = async (document: unknown) => {
    const store = createStore(fakeMeshApi({ getService: async () => snapshotWith(document) }));
    await store.dispatch(loadService('orders-api'));
    return selectServiceAbout(store.getState(), 'orders-api');
  };

  it('reads the description and version from either shape', async () => {
    for (const document of [spec, legacy]) {
      expect(await about(document)).toMatchObject({
        description: 'Accepts and tracks customer orders through to fulfilment.',
        version: '2.4.0',
      });
    }
  });

  it('shows neither for a document it cannot read', async () => {
    expect(await about(cases.documents.unknownDialect)).toMatchObject({ description: null, version: null });
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

  it('names a $ref by its component', () => {
    expect(schemaLabel({ $ref: '#/components/schemas/TreeNode' })).toBe('TreeNode');
    expect(schemaLabel({ type: 'array', items: { $ref: '#/components/schemas/Item' } })).toBe('Item[]');
  });

  it('falls back to the shape word rather than inventing a name', () => {
    expect(schemaLabel({ type: 'object' })).toBe('object');
    // `{}` is "any payload" in a Contract Document — not an object.
    expect(schemaLabel({})).toBe('any');
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

  it('refuses a document in neither shape, which has no schemaDialect', async () => {
    // contract-document.md §1 (spec 1.1): a document without schemaDialect has an unknown dialect.
    const store = await loadedFrom({ type: 'benzene', topics: { 'orders:get-all': { response: 'OrderDto[]' } } });
    expect(store.getState().spec.load).toBe('failed');
    expect(store.getState().spec.spec).toBeNull();
  });

  it('reads a Contract Document with empty lists', async () => {
    const store = await loadedFrom({ schemaDialect: 'openapi-3.0', service: 'orders-api', requests: [], events: [] });
    expect(store.getState().spec.load).toBe('ready');
    expect(selectSpecSummary(store.getState())).toMatchObject({ topics: 0, events: 0, sends: 0 });
  });
});

/**
 * The standalone viewer's fetch reads the body whatever the status, like every other Benzene answer
 * (data/envelope.ts): a failure says why, and a response envelope is judged by its `isSuccessful`.
 */
describe('a spec fetched from a URL', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const serving = (body: string, status = 200, statusText = 'OK') =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status >= 200 && status < 300, status, statusText, text: async () => body })));

  const fetched = async (url = '/benzene/spec?type=benzene') => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadSpecFromUrl(url));
    return store.getState().spec;
  };

  it('renders the document the default route serves', async () => {
    serving(JSON.stringify(spec));
    const state = await fetched();
    expect(state.load).toBe('ready');
    expect(state.spec).toEqual(spec);
  });

  it("names the page after the document's service", async () => {
    serving(JSON.stringify(spec));
    expect((await fetched()).service).toBe('orders-api');
    serving(JSON.stringify(legacy));
    expect((await fetched()).service).toBe('Orders API');
  });

  it('refuses a document in a schema dialect it does not know', async () => {
    serving(JSON.stringify(cases.documents.unknownDialect));
    const state = await fetched();
    expect(state.load).toBe('failed');
    expect(state.error).toMatch(/json-schema-2020-12/);
  });

  it('says why a service refused, from its problem document', async () => {
    // An unsupported `type` is `not-implemented` (wire-contracts §7), never a different document.
    serving(JSON.stringify({ title: 'Not Implemented', status: 501, detail: 'type "graphql" is not served', benzeneStatus: 'not-implemented' }), 501, 'Not Implemented');
    const state = await fetched('/benzene/spec?type=graphql');
    expect(state.load).toBe('failed');
    expect(state.error).toBe('501 Not Implemented fetching the spec: type "graphql" is not served');
  });

  it('does not quote an HTML error page as a reason', async () => {
    serving('<html><body>gateway error</body></html>', 502, 'Bad Gateway');
    expect((await fetched()).error).toBe('502 Bad Gateway fetching the spec');
  });

  it('unwraps a successful response envelope', async () => {
    serving(JSON.stringify({ statusCode: 'ok', isSuccessful: true, headers: {}, body: JSON.stringify(spec) }));
    expect((await fetched()).spec).toEqual(spec);
  });

  it('judges an envelope by isSuccessful, not by the HTTP 200 it arrived in', async () => {
    serving(JSON.stringify({ statusCode: 'not-implemented', isSuccessful: false, headers: {}, body: JSON.stringify({ title: 'Not Implemented', benzeneStatus: 'not-implemented' }) }));
    const state = await fetched();
    expect(state.load).toBe('failed');
    expect(state.error).toBe('The spec request answered not-implemented: Not Implemented');
  });

  it('reports a body that is not a JSON document', async () => {
    serving('<html></html>');
    expect((await fetched('/x')).error).toBe('/x did not answer with a JSON spec document');
  });
});
