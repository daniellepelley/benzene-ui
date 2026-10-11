import { describe, it, expect, vi, afterEach } from 'vitest';
import { optionsFromDocument, createMeshApi } from './meshApi';
import { MeshDispatchBlockedError } from '../store/slices/composeSlice';
import { MeshFetchError } from '../store/slices/estateSlice';

const doc = (attributes: Record<string, string> = {}) => {
  const root = document.createElement('html');
  for (const [name, value] of Object.entries(attributes)) root.setAttribute(name, value);
  return root;
};

const loc = (search: string) => ({ search }) as Location;

describe('deployment configuration', () => {
  it('reads the endpoints a host baked into the document', () => {
    // This is how `Benzene.Mesh.Ui` serves the page from inside a running service. Not reading these
    // is not a cosmetic gap: an embedded dashboard would come up with no live plane at all.
    const options = optionsFromDocument(
      loc(''),
      doc({
        'data-manifest-url': '/artifacts/manifest.json',
        'data-fleet-url': '/benzene/mesh',
        'data-dispatch-url': '/benzene/invoke',
        'data-refresh-url': '/benzene/mesh/refresh',
        'data-logout-url': '/benzene/auth/logout',
      }),
    );

    expect(options).toEqual({
      manifestUrl: '/artifacts/manifest.json',
      fleetEndpoint: '/benzene/mesh',
      dispatchEndpoint: '/benzene/invoke',
      refreshEndpoint: '/benzene/mesh/refresh',
      logoutUrl: '/benzene/auth/logout',
    });
  });

  it('lets a query parameter point the page at another estate', () => {
    // A link has to be able to override a baked-in default, or one dashboard can never show another.
    const options = optionsFromDocument(
      loc(
        '?url=https://other.example/manifest.json&fleet=https://other.example/mesh' +
          '&dispatch=https://other.example/invoke&refresh=https://other.example/refresh' +
          '&logout=https://other.example/logout',
      ),
      doc({
        'data-manifest-url': '/artifacts/manifest.json',
        'data-fleet-url': '/benzene/mesh',
        'data-refresh-url': '/benzene/mesh/refresh',
        'data-logout-url': '/benzene/auth/logout',
      }),
    );

    expect(options.manifestUrl).toBe('https://other.example/manifest.json');
    expect(options.fleetEndpoint).toBe('https://other.example/mesh');
    expect(options.dispatchEndpoint).toBe('https://other.example/invoke');
    expect(options.refreshEndpoint).toBe('https://other.example/refresh');
    expect(options.logoutUrl).toBe('https://other.example/logout');
  });

  it('configures nothing when the deployment says nothing', () => {
    // The realistic static-hosting case: the page sits beside the published artifacts, and every
    // endpoint stays undefined so the capabilities slice reports a read-only, collector-less mesh.
    expect(optionsFromDocument(loc(''), doc())).toEqual({
      manifestUrl: undefined,
      fleetEndpoint: undefined,
      annotationsEndpoint: undefined,
      dispatchEndpoint: undefined,
      refreshEndpoint: undefined,
      logoutUrl: undefined,
    });
  });

  it('does not wire sendMessage without a dispatch endpoint', () => {
    // Fleet and dispatch are deliberately independent opt-ins — a mesh that wires only the read-only
    // collector must not have this silently also turn on live dispatch.
    const api = createMeshApi({ fleetEndpoint: '/benzene/invoke' });
    expect(api.sendMessage).toBeUndefined();
  });

  it('does not wire requestRefresh without a refresh endpoint', () => {
    // Same rule again: no endpoint, no capability, and therefore no control on the page. A mesh that
    // publishes on a schedule and cannot be poked must not grow a button that 404s.
    expect(createMeshApi({ fleetEndpoint: '/benzene/mesh' }).requestRefresh).toBeUndefined();
    expect(createMeshApi({ refreshEndpoint: '/benzene/mesh/refresh' }).requestRefresh).toBeTypeOf('function');
  });
});

describe('asking the mesh for a discovery pass', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const refreshFetch = (response: Partial<Response>) => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 202, statusText: 'Accepted', ...response }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('POSTs with the X-Benzene-Refresh header the server requires', async () => {
    // This header IS the CSRF defence: a cross-site form cannot set one, and a cross-origin fetch
    // that does gets preflighted and refused. The server rejects a POST without it, so losing this
    // line would break every refresh — and "fixing" it by making it configurable would break the
    // defence instead.
    const fetchMock = refreshFetch({});

    await createMeshApi({ refreshEndpoint: '/benzene/mesh/refresh' }).requestRefresh!();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/benzene\/mesh\/refresh$/);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'X-Benzene-Refresh': '1' });
    // The session cookie has to travel, or an authenticated mesh sees an anonymous request.
    expect(init.credentials).toBe('same-origin');
  });

  it('rejects with the status attached, so 429 and 401 can be told apart from a real failure', async () => {
    for (const [status, statusText] of [
      [429, 'Too Many Requests'],
      [401, 'Unauthorized'],
      [500, 'Internal Server Error'],
    ] as const) {
      refreshFetch({ ok: false, status, statusText });
      const failed = createMeshApi({ refreshEndpoint: '/refresh' }).requestRefresh!();

      await expect(failed).rejects.toBeInstanceOf(MeshFetchError);
      await expect(failed).rejects.toMatchObject({ status });
      vi.unstubAllGlobals();
    }
  });
});

describe('artifact fetches carry their status', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects a missing manifest with a 404 that a reducer can recognise', async () => {
    // The whole point: "the mesh has not published yet" is a 404 and nothing else. Reading it out of
    // the message string would be a regex over English.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' })));

    const failed = createMeshApi().getManifest();

    await expect(failed).rejects.toBeInstanceOf(MeshFetchError);
    await expect(failed).rejects.toMatchObject({ status: 404 });
    // The message is unchanged from before the status existed — it is still what an operator reads.
    await expect(failed).rejects.toThrow('404 Not Found for manifest.json');
  });

  it('reports a server error as a server error, not as a missing artifact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' })));

    await expect(createMeshApi().getManifest()).rejects.toMatchObject({ status: 500 });
  });
});

/** A fetch that answers with `body` as JSON and the given HTTP status. */
const answering = (body: unknown, status = 200, statusText = 'OK') => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('Unexpected token');
      return body;
    },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/**
 * Spec 0.2 (transport-bindings §1, D17): the envelope endpoint answers 200 for every envelope it
 * processed, and the outcome is the envelope's `isSuccessful`. A non-2xx status speaks only when no
 * envelope came back.
 */
describe('querying the live plane', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fleet = { generatedAt: '2026-10-11T09:00:00Z', services: [], topics: [], traces: [], issues: [] };
  const query = () => createMeshApi({ fleetEndpoint: '/benzene/invoke' }).getFleet!({ window: { from: 'now-15m' } });

  it('reads the view out of a successful envelope', async () => {
    const fetchMock = answering({ statusCode: 'ok', isSuccessful: true, headers: {}, body: JSON.stringify(fleet) });

    await expect(query()).resolves.toEqual(fleet);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init!.body as string).topic).toBe('benzene:mesh:query:fleet');
  });

  it('reports a failed envelope that arrived as a 200 as a failure', async () => {
    // The 200 is the carrier saying it processed the envelope — not that the query worked.
    answering({ statusCode: 'not-found', isSuccessful: false, headers: {}, body: '{"title":"Not Found"}' });
    await expect(query()).rejects.toThrow('the live plane refused the request (not-found)');
  });

  it('still reads an older collector that answers a failed envelope with a non-2xx status', async () => {
    answering({ statusCode: 'not-found', isSuccessful: false, body: '{}' }, 404, 'Not Found');
    await expect(query()).rejects.toThrow('the live plane refused the request (not-found)');
  });

  it('classifies by isSuccessful, never by the status text', async () => {
    // An application-defined status the collector calls a success is a success...
    answering({ statusCode: 'served-from-cache', isSuccessful: true, body: JSON.stringify(fleet) });
    await expect(query()).resolves.toEqual(fleet);
    vi.unstubAllGlobals();

    // ...and `ok` on a result that says it failed is a failure.
    answering({ statusCode: 'ok', isSuccessful: false, body: '{}' });
    await expect(query()).rejects.toThrow('refused the request (ok)');
  });

  it('does not read a body as an answer when the envelope never said it succeeded', async () => {
    answering({ statusCode: 'ok', body: JSON.stringify(fleet) });
    await expect(query()).rejects.toThrow('without saying whether the request succeeded (ok)');
  });

  it('reports a carrier failure by its HTTP status when no envelope came back', async () => {
    // Authentication the host enforces before it reads the envelope: there is no envelope to read.
    answering('Unauthorized', 401, 'Unauthorized');
    const failed = query();
    await expect(failed).rejects.toBeInstanceOf(MeshFetchError);
    await expect(failed).rejects.toMatchObject({ status: 401 });
  });

  it('reports a 200 that is not an envelope as not an envelope', async () => {
    answering('<html>', 200, 'OK');
    await expect(query()).rejects.toThrow('was not a Benzene envelope');
  });
});

describe('sending a test message', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const send = () =>
    createMeshApi({ dispatchEndpoint: '/benzene/invoke' })
      .sendMessage!({ service: 'orders-api', topic: 'order:create', headers: {}, body: '{}' });

  it('POSTs a benzene:mesh:dispatch envelope carrying the service, topic, headers and body', async () => {
    const fetchMock = answering({
      statusCode: 'ok',
      isSuccessful: true,
      body: JSON.stringify({ statusCode: 'created', isSuccessful: true, body: '{"id":"1"}', headers: {} }),
    });

    const api = createMeshApi({ dispatchEndpoint: '/benzene/invoke' });
    const result = await api.sendMessage!({ service: 'orders-api', topic: 'order:create', headers: { a: 'b' }, body: '{}' });

    expect(result).toEqual({ statusCode: 'created', isSuccessful: true, body: '{"id":"1"}', headers: {} });
    const [, init] = fetchMock.mock.calls[0]!;
    const posted = JSON.parse(init!.body as string);
    expect(posted.topic).toBe('benzene:mesh:dispatch');
    expect(JSON.parse(posted.body)).toEqual({ service: 'orders-api', topic: 'order:create', headers: { a: 'b' }, body: '{}' });
    expect(init!.headers).toMatchObject({ 'X-Benzene-Dispatch': '1' });
  });

  it('throws MeshDispatchBlockedError, not a generic failure, when the mesh refuses the dispatch', async () => {
    // Most commonly MeshDispatchGate's Production check — a safety gate working as intended, which
    // the composer needs to tell apart from "the target service returned an error". Since spec 0.2
    // it arrives as a 200 carrying a problem document; the reason is its `detail`.
    answering({
      statusCode: 'forbidden',
      isSuccessful: false,
      body: JSON.stringify({ title: 'Forbidden', detail: 'Mesh dispatch is disabled in this environment.', benzeneStatus: 'forbidden' }),
    });

    await expect(send()).rejects.toBeInstanceOf(MeshDispatchBlockedError);
    await expect(send()).rejects.toThrow('Mesh dispatch is disabled in this environment.');
  });

  it('still reads a refusal an older collector sent with a non-2xx status', async () => {
    answering({
      statusCode: 'forbidden',
      isSuccessful: false,
      body: JSON.stringify('Mesh dispatch is disabled in this environment.'),
    }, 403, 'Forbidden');

    await expect(send()).rejects.toBeInstanceOf(MeshDispatchBlockedError);
    await expect(send()).rejects.toThrow('Mesh dispatch is disabled in this environment.');
  });

  it('describes a blocked dispatch even when the reason is not JSON', async () => {
    answering({ statusCode: 'not-found', isSuccessful: false, body: "No service named 'unknown' is registered in the mesh." });
    await expect(send()).rejects.toThrow("No service named 'unknown' is registered in the mesh.");
  });

  it('claims neither sent nor blocked when the mesh never said whether it tried', async () => {
    answering({ statusCode: 'ok', body: '{}' });
    const sent = send();
    await expect(sent).rejects.not.toBeInstanceOf(MeshDispatchBlockedError);
    await expect(send()).rejects.toThrow('without saying whether it attempted the dispatch');
  });

  it('a host-level 401 is a failed send, not a blocked one', async () => {
    answering('Unauthorized', 401, 'Unauthorized');
    const sent = send();
    await expect(sent).rejects.toBeInstanceOf(MeshFetchError);
    await expect(sent).rejects.toMatchObject({ status: 401 });
  });

  describe('the target’s result', () => {
    const relayed = (inner: unknown) =>
      answering({ statusCode: 'ok', isSuccessful: true, body: JSON.stringify(inner) });

    it('keeps an absent isSuccessful absent rather than guessing it from the status', async () => {
      relayed({ statusCode: 'ok', body: '{}', headers: {} });
      const result = await send();
      expect(result.isSuccessful).toBeUndefined();
      expect(result.statusCode).toBe('ok');
    });

    it('reads the target’s envelope out of an HTTP-relayed answer, whatever the HTTP status', async () => {
      // HttpMeshServiceDispatcher before spec 0.2 relayed the HTTP code as the status and the raw
      // response as the body. The body is the target's envelope, and the envelope is the outcome:
      // a 200 here is not a success, and an older target's 404 is not the reason.
      const envelope = { statusCode: 'not-found', isSuccessful: false, headers: {}, body: '{"title":"Not Found"}' };
      relayed({ statusCode: '200', body: JSON.stringify(envelope) });
      expect(await send()).toEqual({ statusCode: 'not-found', isSuccessful: false, body: '{"title":"Not Found"}', headers: {} });
      vi.unstubAllGlobals();

      relayed({ statusCode: '404', body: JSON.stringify({ ...envelope, statusCode: 'not-found' }) });
      const old = await send();
      expect(old.statusCode).toBe('not-found');
      expect(old.httpStatus).toBeUndefined();
    });

    it('surfaces the HTTP status when the target answered without an envelope', async () => {
      // A carrier failure: no envelope was processed, so the HTTP status is the only fact there is.
      relayed({ statusCode: '401', body: 'Unauthorized' });
      expect(await send()).toEqual({
        statusCode: '401', isSuccessful: false, httpStatus: 401, body: 'Unauthorized', headers: {},
      });
    });
  });
});

describe('the spec viewer’s source', () => {
  // Mirrors spec-main.tsx's precedence. Kept as a test because the three-way fallback is the thing
  // that lets one artifact serve the mesh, an embedded host, and a static directory.
  const specSource = (search: string, attributes: Record<string, string> = {}, service?: string) => {
    const params = new URLSearchParams(search);
    const root = doc(attributes);
    return params.get('url') ?? root.getAttribute('data-spec-url') ?? (service ? null : 'spec.json');
  };

  it('prefers an explicit url', () => {
    expect(specSource('?url=/artifacts/orders.json', { 'data-spec-url': '/baked.json' })).toBe(
      '/artifacts/orders.json',
    );
  });

  it('falls back to what an embedding host baked in', () => {
    // Benzene.Spec.Ui injects exactly this when it serves the page from inside a service.
    expect(specSource('', { 'data-spec-url': '/benzene/spec' })).toBe('/benzene/spec');
  });

  it('defaults to the document beside it, needing no configuration at all', () => {
    // The same convention the mesh UI uses for manifest.json: the realistic static deployment is
    // this page sitting next to what it renders.
    expect(specSource('')).toBe('spec.json');
  });

  it('does not fetch a document when a mesh service was named instead', () => {
    // In mesh mode the spec comes from the aggregator's stored snapshot, not from a URL.
    expect(specSource('', {}, 'orders-api')).toBeNull();
  });
});
