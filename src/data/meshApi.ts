import type { Manifest, ServiceSnapshot, Topics, Topology, Usage } from '../contracts';
import type { MeshApi } from '../store/slices/estateSlice';
import type { Annotation } from '../store/slices/annotationsSlice';
import type { FleetSnapshot } from '../store/slices/fleetSlice';

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
    ? {
        // POST, not GET: the window is a query the collector runs, and a request body keeps it out
        // of caches and access logs that would otherwise serve one window's answer for another's.
        getFleet: (request) => postJson<FleetSnapshot>(options.fleetEndpoint!, request),
      }
    : {}),
  ...(options.annotationsEndpoint
    ? {
        postAnnotation: (request) =>
          postJson<Annotation>(options.annotationsEndpoint!, request),
      }
    : {}),
});
