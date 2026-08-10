import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { Manifest, ManifestService, ServiceSnapshot } from '../../contracts';

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

export interface EstateState {
  load: LoadState;
  error: string | null;
  generatedAtUtc: string | null;
  services: ManifestService[];
  /** Per-service detail, loaded on demand. Keyed by service name. */
  snapshots: Record<string, ServiceSnapshot>;
  snapshotLoad: Record<string, LoadState>;
  /**
   * Services whose status moved on the most recent refresh, plus any that appeared.
   *
   * Kept so a card can announce a change the reader was not looking at. Deliberately *not* a
   * timestamp: the list is replaced wholesale by the next refresh, so it expires on its own and no
   * clock is involved. Empty on first load — a wall of flashing cards on arrival says nothing,
   * because "everything is new" and "the page just opened" are the same picture.
   */
  changed: string[];
}

const initialState: EstateState = {
  load: 'idle',
  error: null,
  generatedAtUtc: null,
  services: [],
  snapshots: {},
  snapshotLoad: {},
  changed: [],
};

/** How often the published artifacts are re-fetched. */
export const ARTIFACT_POLL_MS = 60_000;

/**
 * Replace the declared plane, noting what moved.
 *
 * Shared by the first load and every refresh, so "what changed" has one definition. A service the
 * previous manifest did not carry counts as changed — that is the arrival case, and a new service
 * appearing in an estate is exactly the event worth catching a reader's eye with.
 */
function applyManifest(state: EstateState, manifest: Manifest) {
  const before = new Map(state.services.map((s) => [s.name, s.status]));
  state.changed =
    before.size === 0 ? [] : manifest.services.filter((s) => before.get(s.name) !== s.status).map((s) => s.name);
  state.generatedAtUtc = manifest.generatedAtUtc;
  state.services = manifest.services;
}

/**
 * The manifest fetch. `fetchJson` is injected as a thunk extra rather than imported, so tests drive
 * the store with a stub and never touch the network — the store is the unit under test, not fetch.
 */
export const loadManifest = createAsyncThunk<Manifest, void, { extra: MeshApi }>(
  'estate/loadManifest',
  (_, { extra }) => extra.getManifest(),
);

/**
 * The same fetch again, on a timer, without the loading state.
 *
 * Separate from `loadManifest` because a refresh must not blank the page it is refreshing. Without
 * this the declared plane was fetched once and never again: a dashboard left open showed the
 * statuses it had at page load for as long as the tab stayed open, under a "generated" timestamp
 * that never moved. Nothing said so.
 */
export const refreshManifest = createAsyncThunk<Manifest, void, { extra: MeshApi }>(
  'estate/refreshManifest',
  (_, { extra }) => extra.getManifest(),
);

export const loadService = createAsyncThunk<ServiceSnapshot, string, { extra: MeshApi }>(
  'estate/loadService',
  (name, { extra }) => extra.getService(name),
);

export interface MeshApi {
  getManifest(): Promise<Manifest>;
  getService(name: string): Promise<ServiceSnapshot>;
  getTopics(): Promise<import('../../contracts').Topics>;
  getTopology(): Promise<import('../../contracts').Topology>;
  getUsage(): Promise<import('../../contracts').Usage>;
  /**
   * Optional: absent when no collector is wired. The estate renders fine without it.
   *
   * The window is passed on every call rather than configured once, because the reader can change
   * it — and a collector answering over a different window than the one the UI is labelling is the
   * kind of quiet lie this codebase exists to avoid.
   */
  getFleet?(query: import('./fleetSlice').FleetQuery): Promise<import('../../contracts').FleetView>;
  getAnnotations?(): Promise<import('./annotationsSlice').Annotation[]>;
  postAnnotation?(request: {
    entity: string;
    author: string;
    text: string;
  }): Promise<import('./annotationsSlice').Annotation>;
  /** Optional: absent on a read-only mesh, which disables the composer rather than hiding it. */
  sendMessage?(message: {
    topic: string;
    headers: Record<string, string>;
    body: string;
  }): Promise<import('./composeSlice').ComposeResult>;
}

const estateSlice = createSlice({
  name: 'estate',
  initialState,
  reducers: {
    /** Used by the live poll to replace the declared plane without a loading flicker. */
    manifestRefreshed(state, action: PayloadAction<Manifest>) {
      applyManifest(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadManifest.pending, (state) => {
        state.load = 'loading';
        state.error = null;
      })
      .addCase(loadManifest.fulfilled, (state, action) => {
        state.load = 'ready';
        applyManifest(state, action.payload);
      })
      .addCase(loadManifest.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'Failed to load the manifest';
      })
      .addCase(refreshManifest.fulfilled, (state, action) => {
        applyManifest(state, action.payload);
      })
      // A failed refresh is deliberately silent: the last good manifest keeps showing, because a
      // transient fetch failure is not news about the estate, and blanking the page over one would
      // be. The stale "generated" timestamp in the header is what tells the reader how old this is.
      .addCase(refreshManifest.rejected, () => {})
      .addCase(loadService.pending, (state, action) => {
        state.snapshotLoad[action.meta.arg] = 'loading';
      })
      .addCase(loadService.fulfilled, (state, action) => {
        state.snapshotLoad[action.payload.name] = 'ready';
        state.snapshots[action.payload.name] = action.payload;
      })
      .addCase(loadService.rejected, (state, action) => {
        state.snapshotLoad[action.meta.arg] = 'failed';
      });
  },
});

export const { manifestRefreshed } = estateSlice.actions;
export default estateSlice.reducer;
