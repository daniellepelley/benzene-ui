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
}

const initialState: EstateState = {
  load: 'idle',
  error: null,
  generatedAtUtc: null,
  services: [],
  snapshots: {},
  snapshotLoad: {},
};

/**
 * The manifest fetch. `fetchJson` is injected as a thunk extra rather than imported, so tests drive
 * the store with a stub and never touch the network — the store is the unit under test, not fetch.
 */
export const loadManifest = createAsyncThunk<Manifest, void, { extra: MeshApi }>(
  'estate/loadManifest',
  (_, { extra }) => extra.getManifest(),
);

export const loadService = createAsyncThunk<ServiceSnapshot, string, { extra: MeshApi }>(
  'estate/loadService',
  (name, { extra }) => extra.getService(name),
);

export interface MeshApi {
  getManifest(): Promise<Manifest>;
  getService(name: string): Promise<ServiceSnapshot>;
}

const estateSlice = createSlice({
  name: 'estate',
  initialState,
  reducers: {
    /** Used by the live poll to replace the declared plane without a loading flicker. */
    manifestRefreshed(state, action: PayloadAction<Manifest>) {
      state.generatedAtUtc = action.payload.generatedAtUtc;
      state.services = action.payload.services;
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
        state.generatedAtUtc = action.payload.generatedAtUtc;
        state.services = action.payload.services;
      })
      .addCase(loadManifest.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'Failed to load the manifest';
      })
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
