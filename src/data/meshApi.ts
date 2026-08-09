import type { FleetView, Manifest, ServiceSnapshot, Topics, Topology, Usage } from '../contracts';
import type { MeshApi } from '../store/slices/estateSlice';
import type { Annotation } from '../store/slices/annotationsSlice';

/**
 * Resolves artifact paths relative to the page, exactly as the original UI's `resolveUrl` did: the
 * page is served from wherever the aggregator published its artifacts, so everything is relative and
 * nothing needs configuring.
 */
const resolveUrl = (path: string) => new URL(path, document.baseURI).toString();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(resolveUrl(path), { headers: { accept: 'application/json' } });
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

export interface MeshApiOptions {
  /** Set when a live collector is reachable; absent means the dashboard shows the declared plane only. */
  fleetEndpoint?: string;
  /** Set when annotations are writable. Absent means a read-only mesh. */
  annotationsEndpoint?: string;
}

export const createMeshApi = (options: MeshApiOptions = {}): MeshApi => ({
  getManifest: () => getJson<Manifest>('manifest.json'),
  getService: (name) => getJson<ServiceSnapshot>(`services/${encodeURIComponent(name)}.json`),
  getTopics: () => getJson<Topics>('topics.json'),
  getTopology: () => getJson<Topology>('topology.json'),
  getUsage: () => getJson<Usage>('usage.json'),
  getAnnotations: () => getJson<{ annotations: Annotation[] }>('annotations.json').then((d) => d.annotations),
  ...(options.fleetEndpoint
    ? { getFleet: (query) => meshQuery<FleetView>(options.fleetEndpoint!, 'benzene:mesh:query:fleet', query) }
    : {}),
  ...(options.annotationsEndpoint
    ? {
        postAnnotation: (request) =>
          postJson<Annotation>(options.annotationsEndpoint!, request),
      }
    : {}),
});
