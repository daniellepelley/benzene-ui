import { createSlice } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';

/**
 * What this mesh can actually do.
 *
 * Several endpoints are optional: a mesh with no collector has no live plane, a read-only mesh
 * cannot take annotations, and one without an invoke endpoint cannot be sent test messages. The UI
 * has to render differently for each, and "is the UI a function of state" means those facts have to
 * BE state — not something a component discovers by poking at the API object.
 *
 * Derived once at store creation and never changed, so it is a reducer with no actions.
 */
export interface CapabilitiesState {
  /** A collector is wired, so heartbeats/issues/flows can be observed. */
  fleet: boolean;
  /** Annotations can be written, not just read. */
  annotate: boolean;
  /** Messages can be composed AND sent. */
  invoke: boolean;
  /**
   * Where this deployment published its artifacts, when it said.
   *
   * Deployment shape is a fact about the mesh, not a component's business — the same reason the
   * three booleans live here. It is needed to build links that must resolve in the reader's
   * deployment rather than in ours.
   */
  manifestUrl: string | null;
}

export const capabilitiesOf = (api: MeshApi, manifestUrl?: string): CapabilitiesState => ({
  fleet: typeof api.getFleet === 'function',
  annotate: typeof api.postAnnotation === 'function',
  invoke: typeof api.sendMessage === 'function',
  manifestUrl: manifestUrl ?? null,
});

const capabilitiesSlice = createSlice({
  name: 'capabilities',
  initialState: { fleet: false, annotate: false, invoke: false, manifestUrl: null } as CapabilitiesState,
  reducers: {},
});

export default capabilitiesSlice.reducer;
