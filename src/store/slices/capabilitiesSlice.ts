import { createSlice } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';

/**
 * What this mesh can actually do.
 *
 * Several endpoints are optional: a mesh with no collector has no live plane, a read-only mesh
 * without an invoke endpoint cannot be sent test messages. The UI
 * has to render differently for each, and "is the UI a function of state" means those facts have to
 * BE state — not something a component discovers by poking at the API object.
 *
 * Derived once at store creation and never changed, so it is a reducer with no actions.
 */
export interface CapabilitiesState {
  /** A collector is wired, so heartbeats/issues/flows can be observed. */
  fleet: boolean;
  /** Messages can be composed AND sent. */
  invoke: boolean;
  /**
   * The mesh will run a discovery pass on demand, so a Refresh control has something to do. Without
   * it the catalog changes only when the mesh's own schedule runs, and no control is offered.
   */
  refresh: boolean;
  /**
   * Where this deployment published its artifacts, when it said.
   *
   * Deployment shape is a fact about the mesh, not a component's business — the same reason the
   * booleans live here. It is needed to build links that must resolve in the reader's deployment
   * rather than in ours.
   */
  manifestUrl: string | null;
  /**
   * Where signing out goes, when the page is served behind a login gate.
   *
   * A URL rather than a boolean because signing out is a plain navigation to the host's logout
   * endpoint, which redirects — there is nothing to fetch and nothing to await. Null means no auth
   * is configured, which is the ordinary local and static-hosting case, and means no control at all
   * rather than a disabled one.
   */
  logoutUrl: string | null;
  /**
   * Which estate this page is looking at, when the deployment says.
   *
   * THE SEAM, at N=1. A mesh UI today reads one estate, resolved relative to its own origin, and a
   * dev mesh and a production mesh render pixel-identically — the only thing telling them apart is
   * the URL in the address bar. That is already a defect at one environment, and it is the thing
   * that has to exist before a neutral deployment can ever point at several
   * (work/mesh-environments-and-access.md E9).
   *
   * Null is the honest and common case: `placement.environment` is not yet in the spec (E1), so
   * nothing publishes this and the chrome says the environment is not published. It NEVER defaults
   * to "dev" — an unlabelled production mesh reading "dev" is the single most dangerous thing this
   * field could do.
   */
  environment: string | null;
}

export const capabilitiesOf = (
  api: MeshApi,
  manifestUrl?: string,
  logoutUrl?: string,
  environment?: string,
): CapabilitiesState => ({
  fleet: typeof api.getFleet === 'function',
  invoke: typeof api.sendMessage === 'function',
  refresh: typeof api.requestRefresh === 'function',
  manifestUrl: manifestUrl ?? null,
  logoutUrl: logoutUrl ?? null,
  // Trimmed, because an attribute a host injected as an empty string is not a label.
  environment: environment?.trim() || null,
});

const capabilitiesSlice = createSlice({
  name: 'capabilities',
  initialState: {
    fleet: false,
    invoke: false,
    refresh: false,
    environment: null,
    manifestUrl: null,
    logoutUrl: null,
  } as CapabilitiesState,
  reducers: {},
});

export default capabilitiesSlice.reducer;
