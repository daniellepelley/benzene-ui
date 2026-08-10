import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi, LoadState } from './estateSlice';
import type { ServiceSpec } from '../../contracts';

/**
 * One service's own spec document — what it says it can do, in its own words.
 *
 * A different artifact from anything in `catalog`, and deliberately its own slice: the catalog is
 * the aggregator's *cross-service* view, assembled by someone else, while this is the single
 * service's self-description fetched on demand. They have different sources, different lifetimes and
 * different failure modes, which is the same test that keeps `estate` and `fleet` apart.
 */
export interface SpecState {
  load: LoadState;
  error: string | null;
  /** The service the loaded spec belongs to, so a stale render can be told from a fresh one. */
  service: string | null;
  spec: ServiceSpec | null;
  /** Which operation the reader has opened. View state, so deep links and tests both work. */
  expanded: string[];
  /** Whether Benzene's own reserved topics are in view. Off by default, as everywhere else. */
  showUtility: boolean;
}

const initialState: SpecState = {
  load: 'idle',
  error: null,
  service: null,
  spec: null,
  expanded: [],
  showUtility: false,
};

/**
 * The spec comes from the service snapshot the aggregator already stored, not from the service.
 *
 * That is the whole reason this page exists: the service serves JSON and only JSON, and the spec
 * viewer renders what the aggregator captured into the same origin. A UI that fetched the service
 * directly would need CORS on every service in the estate.
 */
export const loadSpec = createAsyncThunk<
  { service: string; spec: ServiceSpec | null },
  string,
  { extra: MeshApi }
>('spec/load', async (service, { extra }) => {
  const snapshot = await extra.getService(service);
  if (!snapshot.specJson) return { service, spec: null };
  try {
    return { service, spec: JSON.parse(snapshot.specJson) as ServiceSpec };
  } catch {
    // The aggregator stores whatever the service published, verbatim. A service serving YAML, or
    // HTML from a misrouted proxy, is a legible failure — not a crash.
    throw new Error(`${service} published a spec that is not JSON`);
  }
});

/**
 * The standalone path: a spec document fetched straight from a URL.
 *
 * The same viewer serves both. In the mesh it reads the aggregator's stored snapshot, so the service
 * never has to serve HTML or open CORS; pointed at a URL it renders any conforming spec document —
 * a file on disk, a service's own `benzene:spec` response, a build artifact in CI. One page, because
 * the *reading* is identical and only the fetch differs, and two pages would drift.
 */
export const loadSpecFromUrl = createAsyncThunk<{ service: string; spec: ServiceSpec | null }, string>(
  'spec/loadFromUrl',
  async (url) => {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} fetching the spec`);
    const spec = (await response.json()) as ServiceSpec;
    return { service: spec.info?.title ?? url, spec };
  },
);

const specSlice = createSlice({
  name: 'spec',
  initialState,
  reducers: {
    operationToggled(state, action: PayloadAction<string>) {
      const at = state.expanded.indexOf(action.payload);
      if (at === -1) state.expanded.push(action.payload);
      else state.expanded.splice(at, 1);
    },
    allOperationsCollapsed(state) {
      state.expanded = [];
    },
    specUtilityToggled(state) {
      state.showUtility = !state.showUtility;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSpec.pending, (state) => {
        state.load = 'loading';
        state.error = null;
      })
      .addCase(loadSpec.fulfilled, (state, action) => {
        state.load = 'ready';
        state.service = action.payload.service;
        state.spec = action.payload.spec;
        // A new service is a new document; carrying the old one's open operations across would
        // expand whatever happened to share an index.
        state.expanded = [];
      })
      .addCase(loadSpec.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'The spec could not be loaded';
        state.spec = null;
      })
      // Same states, different fetch — the reducer cannot tell, and should not have to.
      .addCase(loadSpecFromUrl.pending, (state) => {
        state.load = 'loading';
        state.error = null;
      })
      .addCase(loadSpecFromUrl.fulfilled, (state, action) => {
        state.load = 'ready';
        state.service = action.payload.service;
        state.spec = action.payload.spec;
        state.expanded = [];
      })
      .addCase(loadSpecFromUrl.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'The spec could not be loaded';
        state.spec = null;
      });
  },
});

export const { operationToggled, allOperationsCollapsed, specUtilityToggled } = specSlice.actions;
export default specSlice.reducer;
