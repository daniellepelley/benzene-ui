import type { FleetView, Manifest, ServiceSnapshot, Topics, Topology, Usage } from '../contracts';
import type { MeshApi } from '../store/slices/estateSlice';
import { MeshFetchError } from '../store/slices/estateSlice';
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

/**
 * Every non-`ok` response leaves here as a {@link MeshFetchError}, not a bare `Error`.
 *
 * The message is unchanged — but the status travels with it, so a caller can tell "this artifact has
 * not been published yet" (404) from "the mesh is broken" (500) and "your session ran out" (401)
 * from "slow down" (429) without reading English out of a message string.
 */
const failed = (response: Response, path: string) =>
  new MeshFetchError(`${response.status} ${response.statusText} for ${path}`, response.status);

async function getJson<T>(path: string, manifestUrl?: string): Promise<T> {
  const response = await fetch(resolveUrl(path, manifestUrl), { headers: { accept: 'application/json' } });
  if (!response.ok) throw failed(response, path);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(resolveUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw failed(response, path);
  return (await response.json()) as T;
}

/**
 * The header is the point.
 *
 * `X-Benzene-Refresh: 1` is what makes this endpoint safe to expose behind a session cookie: a
 * cross-site HTML form — the classic CSRF vector — cannot set a custom header at all, and a
 * cross-origin `fetch` that sets one turns the request into a preflighted one, which the server
 * refuses. So the header is the CSRF defence, agreed with the server side, and the server rejects a
 * POST without it. It is hardcoded here on purpose: a configurable CSRF token is a CSRF token that
 * gets configured away.
 *
 * `same-origin` credentials is the fetch default, stated rather than assumed because this request
 * only works if it carries the session cookie — and because it is the correct answer for a
 * cross-origin endpoint too, where the preflight makes the request fail by design rather than
 * silently posting without a session.
 *
 * There is no response body to read: the mesh answers that it has accepted the pass, and the fresh
 * artifacts are then re-read through the normal artifact fetches.
 */
async function postRefresh(endpoint: string): Promise<void> {
  const response = await fetch(resolveUrl(endpoint), {
    method: 'POST',
    headers: { 'X-Benzene-Refresh': '1', accept: 'application/json' },
    credentials: 'same-origin',
  });
  if (!response.ok) throw failed(response, endpoint);
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
  /**
   * Set when the mesh can be asked to run a discovery/aggregation pass on demand. Absent means the
   * catalog only changes when the mesh's own schedule runs, and no Refresh control is offered —
   * rather than one that cannot work.
   */
  refreshEndpoint?: string;
  /**
   * Set when the page is served behind a login gate (`Benzene.Mesh.Auth.Oidc`) that has somewhere to
   * sign out to. Absent is the common local and static-hosting case: there is no session, so there
   * is no Sign out control — not a disabled one.
   */
  logoutUrl?: string;
}

/**
 * How a deployment tells the page where things are.
 *
 * Query parameters win, so a link can point one page at another estate. Behind them sit attributes
 * on the document root, which is how a host that serves this page from inside a running service
 * bakes its own endpoints in — `Benzene.Mesh.Ui` injects these, and without reading them an embedded
 * dashboard would come up with no live plane and no writable annotations at all.
 *
 * Every entry is the same shape on purpose: one attribute, one query override, one capability that
 * exists only when its URL does. A deployment that says nothing gets a page with nothing it cannot
 * do on it.
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
    refreshEndpoint: pick('refresh', 'data-refresh-url'),
    logoutUrl: pick('logout', 'data-logout-url'),
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
    // Coerced at the boundary. An artifact that parses but does not carry the expected array — an
    // older aggregator, a different port, a hand-edited file — used to reach the store as `undefined`
    // and take the whole application down on the first selector that filtered it. A missing list is
    // an empty list; it is not a reason for the product to stop existing.
    getJson<{ annotations?: Annotation[] }>('annotations.json', options.manifestUrl)
      .then((d) => (Array.isArray(d.annotations) ? d.annotations : [])),
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
  ...(options.refreshEndpoint
    ? { requestRefresh: () => postRefresh(options.refreshEndpoint!) }
    : {}),
});
