import type { FleetView, Manifest, ServiceSnapshot, Topics, Topology, Usage } from '../contracts';
import type { MeshApi } from '../store/slices/estateSlice';
import type { Annotation } from '../store/slices/annotationsSlice';
import type { ComposeResult } from '../store/slices/composeSlice';
import { MeshDispatchBlockedError } from '../store/slices/composeSlice';

/**
 * Resolves an artifact path against the manifest's location, then the page.
 *
 * `manifestUrl` is very often itself relative — a bare filename, or root-relative like
 * `/artifacts/manifest.json` when an aggregator host self-serves its dashboard — and `URL()` needs
 * an absolute base, so it is resolved against the page first and everything else against that.
 * With no manifest URL at all the page is assumed to sit beside the published artifacts, which is
 * the realistic static-hosting deployment and needs no configuration whatsoever.
 */
const resolveUrl = (path: string, manifestUrl?: string) => {
  try {
    const base = manifestUrl ? new URL(manifestUrl, document.baseURI) : document.baseURI;
    return new URL(path, base).toString();
  } catch {
    return path;
  }
};

async function getJson<T>(path: string, manifestUrl?: string): Promise<T> {
  const response = await fetch(resolveUrl(path, manifestUrl), { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${path}`);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(resolveUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${path}`);
  return (await response.json()) as T;
}

/**
 * One Benzene message, over the mesh wire envelope.
 *
 * The collector is not a REST API — it is a Benzene service, and every query to it is a message on a
 * topic. The envelope is the whole point of the framework: the same `{topic, headers, body}` shape
 * travels over HTTP here, and over SQS, Service Bus or a direct invoke elsewhere, without the caller
 * changing. `body` is a JSON *string* inside the envelope, and the response body is too — that is the
 * contract, not an accident of this client.
 *
 * A non-`ok` status is an application-level failure carried in a 200 response, so the HTTP status
 * alone is not enough to know whether the query worked.
 */
async function meshQuery<T>(endpoint: string, topic: string, body: unknown): Promise<T> {
  const envelope = await postJson<{ statusCode: string; body?: string }>(endpoint, {
    topic,
    headers: {},
    body: JSON.stringify(body ?? {}),
  });
  if (envelope.statusCode !== 'ok') throw new Error(`${topic} answered ${envelope.statusCode}`);
  return JSON.parse(envelope.body ?? '{}') as T;
}

/**
 * Dispatches a `mesh:dispatch` message to `endpoint` and returns the target service's own response.
 *
 * `benzene:mesh:dispatch` answers over the same wire envelope every mesh query does, but its outer
 * envelope status means something different: it reports whether the *mesh itself* would even attempt
 * the send (`ok`, or `forbidden`/`bad-request`/`not-found`/`not-implemented` — see
 * `Benzene.Mesh.Dispatch.MeshDispatchMessageHandler`), never the target service's own outcome. That
 * lives one layer in, as the `MeshDispatchResult` JSON the outer `ok` envelope's `body` carries. So a
 * non-`ok` outer status is not "the send failed" — usually it is a safety gate (most commonly
 * `MeshDispatchGate`'s Production check) refusing to even try, and the composer needs to say that
 * distinctly rather than folding it into "the target returned an error", which the inner
 * `ComposeResult.statusCode` already covers.
 */
async function dispatchMessage(
  endpoint: string,
  request: { service: string; topic: string; headers: Record<string, string>; body: string },
): Promise<ComposeResult> {
  const envelope = await postJson<{ statusCode: string; body?: string }>(endpoint, {
    topic: 'benzene:mesh:dispatch',
    headers: {},
    body: JSON.stringify(request),
  });

  if (envelope.statusCode !== 'ok') {
    throw new MeshDispatchBlockedError(describeBlockedDispatch(envelope), envelope.statusCode);
  }

  return JSON.parse(envelope.body ?? '{}') as ComposeResult;
}

/**
 * The blocked/refused envelope's `body` is whatever the failing `IBenzeneResult`'s message
 * serializes to — not guaranteed to be a `RawStringMessage`-shaped JSON string the way a successful
 * dispatch's body is, so this reads it defensively rather than assuming one shape.
 */
function describeBlockedDispatch(envelope: { statusCode: string; body?: string }): string {
  const raw = envelope.body?.trim();
  if (!raw) return `The mesh refused this dispatch (${envelope.statusCode}).`;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  } catch {
    // Not JSON — the raw text itself is the message.
  }
  return raw;
}

export interface MeshApiOptions {
  /** Where the aggregator published its artifacts. Everything else resolves relative to it. */
  manifestUrl?: string;
  /** Set when a live collector is reachable; absent means the dashboard shows the declared plane only. */
  fleetEndpoint?: string;
  /** Set when annotations are writable. Absent means a read-only mesh. */
  annotationsEndpoint?: string;
  /**
   * Set when the mesh also wires `Benzene.Mesh.Dispatch`'s `UseMeshDispatch()`. Absent means the Test
   * Console renders read-only (compose and copy a payload, no send button) — a deliberate, separate
   * opt-in from `fleetEndpoint`: a mesh that wires only the collector's read-only fleet queries must
   * not have this silently also turn on live dispatch, even though the two often share one endpoint.
   */
  dispatchEndpoint?: string;
}

/**
 * How a deployment tells the page where things are.
 *
 * Query parameters win, so a link can point one page at another estate. Behind them sit attributes
 * on the document root, which is how a host that serves this page from inside a running service
 * bakes its own endpoints in — `Benzene.Mesh.Ui` injects exactly these three, and without reading
 * them an embedded dashboard would come up with no live plane and no writable annotations at all.
 */
export function optionsFromDocument(location: Location, root: HTMLElement): MeshApiOptions {
  const params = new URLSearchParams(location.search);
  const pick = (param: string, attribute: string) =>
    params.get(param) ?? root.getAttribute(attribute) ?? undefined;

  return {
    manifestUrl: pick('url', 'data-manifest-url'),
    fleetEndpoint: pick('fleet', 'data-fleet-url'),
    annotationsEndpoint: pick('annotations', 'data-annotations-url'),
    dispatchEndpoint: pick('dispatch', 'data-dispatch-url'),
  };
}

export const createMeshApi = (options: MeshApiOptions = {}): MeshApi => ({
  getManifest: () => getJson<Manifest>(options.manifestUrl ?? 'manifest.json'),
  getService: (name) =>
    getJson<ServiceSnapshot>(`services/${encodeURIComponent(name)}.json`, options.manifestUrl),
  getTopics: () => getJson<Topics>('topics.json', options.manifestUrl),
  getTopology: () => getJson<Topology>('topology.json', options.manifestUrl),
  getUsage: () => getJson<Usage>('usage.json', options.manifestUrl),
  getAnnotations: () =>
    getJson<{ annotations: Annotation[] }>('annotations.json', options.manifestUrl).then((d) => d.annotations),
  ...(options.fleetEndpoint
    ? { getFleet: (query) => meshQuery<FleetView>(options.fleetEndpoint!, 'benzene:mesh:query:fleet', query) }
    : {}),
  ...(options.annotationsEndpoint
    ? {
        postAnnotation: (request) =>
          postJson<Annotation>(options.annotationsEndpoint!, request),
      }
    : {}),
  ...(options.dispatchEndpoint
    ? { sendMessage: (message) => dispatchMessage(options.dispatchEndpoint!, message) }
    : {}),
});
