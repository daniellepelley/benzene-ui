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
}

export const capabilitiesOf = (
  api: MeshApi,
  manifestUrl?: string,
  logoutUrl?: string,
): CapabilitiesState => ({
  fleet: typeof api.getFleet === 'function',
  invoke: typeof api.sendMessage === 'function',
  refresh: typeof api.requestRefresh === 'function',
  manifestUrl: manifestUrl ?? null,
  logoutUrl: logoutUrl ?? null,
});

const capabilitiesSlice = createSlice({
  name: 'capabilities',
  initialState: {
    fleet: false,
    invoke: false,
    refresh: false,
    manifestUrl: null,
    logoutUrl: null,
  } as CapabilitiesState,
  reducers: {},
});

export default capabilitiesSlice.reducer;
