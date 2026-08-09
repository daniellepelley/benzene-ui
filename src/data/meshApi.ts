import type { Manifest, ServiceSnapshot } from '../contracts';
import type { MeshApi } from '../store/slices/estateSlice';

/**
 * Resolves artifact paths relative to the page, exactly as the original UI's `resolveUrl` did: the
 * page is served from wherever the aggregator published its artifacts, so everything is relative and
 * nothing is configured.
 */
const resolveUrl = (path: string) => new URL(path, document.baseURI).toString();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(resolveUrl(path), { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${path}`);
  }
  return (await response.json()) as T;
}

export const createMeshApi = (): MeshApi => ({
  getManifest: () => getJson<Manifest>('manifest.json'),
  getService: (name) => getJson<ServiceSnapshot>(`services/${encodeURIComponent(name)}.json`),
});
