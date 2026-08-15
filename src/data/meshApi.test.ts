import { describe, it, expect, vi, afterEach } from 'vitest';
import { optionsFromDocument, createMeshApi } from './meshApi';
import { MeshDispatchBlockedError } from '../store/slices/composeSlice';

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
        'data-annotations-url': '/benzene/annotations',
        'data-dispatch-url': '/benzene/invoke',
      }),
    );

    expect(options).toEqual({
      manifestUrl: '/artifacts/manifest.json',
      fleetEndpoint: '/benzene/mesh',
      annotationsEndpoint: '/benzene/annotations',
      dispatchEndpoint: '/benzene/invoke',
    });
  });

  it('lets a query parameter point the page at another estate', () => {
    // A link has to be able to override a baked-in default, or one dashboard can never show another.
    const options = optionsFromDocument(
      loc('?url=https://other.example/manifest.json&fleet=https://other.example/mesh&dispatch=https://other.example/invoke'),
      doc({ 'data-manifest-url': '/artifacts/manifest.json', 'data-fleet-url': '/benzene/mesh' }),
    );

    expect(options.manifestUrl).toBe('https://other.example/manifest.json');
    expect(options.fleetEndpoint).toBe('https://other.example/mesh');
    expect(options.dispatchEndpoint).toBe('https://other.example/invoke');
  });

  it('configures nothing when the deployment says nothing', () => {
    // The realistic static-hosting case: the page sits beside the published artifacts, and every
    // endpoint stays undefined so the capabilities slice reports a read-only, collector-less mesh.
    expect(optionsFromDocument(loc(''), doc())).toEqual({
      manifestUrl: undefined,
      fleetEndpoint: undefined,
      annotationsEndpoint: undefined,
      dispatchEndpoint: undefined,
    });
  });

  it('does not wire sendMessage without a dispatch endpoint', () => {
    // Fleet and dispatch are deliberately independent opt-ins — a mesh that wires only the read-only
    // collector must not have this silently also turn on live dispatch.
    const api = createMeshApi({ fleetEndpoint: '/benzene/invoke' });
    expect(api.sendMessage).toBeUndefined();
  });
});

describe('sending a test message', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs a benzene:mesh:dispatch envelope carrying the service, topic, headers and body', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ statusCode: 'ok', body: JSON.stringify({ statusCode: 'created', body: '{"id":"1"}', headers: {} }) }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const api = createMeshApi({ dispatchEndpoint: '/benzene/invoke' });
    const result = await api.sendMessage!({ service: 'orders-api', topic: 'order:create', headers: { a: 'b' }, body: '{}' });

    expect(result).toEqual({ statusCode: 'created', body: '{"id":"1"}', headers: {} });
    const [, init] = fetchMock.mock.calls[0]!;
    const posted = JSON.parse(init!.body as string);
    expect(posted.topic).toBe('benzene:mesh:dispatch');
    expect(JSON.parse(posted.body)).toEqual({ service: 'orders-api', topic: 'order:create', headers: { a: 'b' }, body: '{}' });
  });

  it('throws MeshDispatchBlockedError, not a generic failure, when the mesh refuses the dispatch', async () => {
    // Most commonly MeshDispatchGate's Production check — a safety gate working as intended, which
    // the composer needs to tell apart from "the target service returned an error".
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        statusCode: 'forbidden',
        body: JSON.stringify('Mesh dispatch is disabled in this environment.'),
      }),
    })));

    const api = createMeshApi({ dispatchEndpoint: '/benzene/invoke' });
    const send = api.sendMessage!({ service: 'orders-api', topic: 'order:create', headers: {}, body: '{}' });

    await expect(send).rejects.toBeInstanceOf(MeshDispatchBlockedError);
    await expect(send).rejects.toThrow('Mesh dispatch is disabled in this environment.');
  });

  it('describes a blocked dispatch even when the reason is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ statusCode: 'not-found', body: "No service named 'unknown' is registered in the mesh." }),
    })));

    const api = createMeshApi({ dispatchEndpoint: '/benzene/invoke' });
    const send = api.sendMessage!({ service: 'unknown', topic: 'order:create', headers: {}, body: '{}' });

    await expect(send).rejects.toThrow("No service named 'unknown' is registered in the mesh.");
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
