import type { MeshApi } from '../store/slices/estateSlice';
import manifest from '../../contracts/artifacts/manifest.json';
import topics from '../../contracts/artifacts/topics.json';
import topology from '../../contracts/artifacts/topology.json';
import usage from '../../contracts/artifacts/usage.json';
import orders from '../../contracts/artifacts/services/orders-api.json';
import type { Manifest, ServiceSnapshot, Topics, Topology, Usage } from '../contracts';

/**
 * The mesh API backed by the vendored sample artifacts.
 *
 * Tests get a real, spec-shaped estate for free, and — because these are the same samples the type
 * generator reads — a contract change that breaks the types breaks the fixtures too. Override only
 * the method a test is about.
 */
export const fakeMeshApi = (over: Partial<MeshApi> = {}): MeshApi => ({
  getManifest: async () => manifest as Manifest,
  getService: async () => orders as ServiceSnapshot,
  getTopics: async () => topics as Topics,
  getTopology: async () => topology as Topology,
  getUsage: async () => usage as Usage,
  ...over,
});
