import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { Manifest, ManifestService, ServiceSnapshot } from '../../contracts';
import { loadCatalog } from './catalogSlice';

export type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The estate has one state the other slices have no use for: `empty` — the aggregator has published
 * nothing yet. That is not a failure, it is the first minute of every fresh deployment, and it was
 * being rendered as "404 Not Found for manifest.json".
 */
export type EstateLoadState = LoadState | 'empty';

/**
 * An HTTP failure from the mesh, carrying the status the reducers need.
 *
 * A 404 on `manifest.json` means something completely different from a 500, a refused connection or
 * a document that will not parse: the mesh is up and has simply not run its first discovery pass.
 * Only the status can tell those apart, and a message string cannot be pattern-matched for it
 * honestly — so the fetch layer throws this, and the slices read `status`.
 *
 * `code` mirrors it because Redux Toolkit's error serialisation keeps `name`, `message`, `stack` and
 * `code` and drops everything else, so a thunk that lets the error through rather than converting it
 * to a rejection value still leaves the status readable.
 */
export class MeshFetchError extends Error {
  readonly code: string;

  constructor(
    message: string,
    /** The HTTP status the mesh answered with. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'MeshFetchError';
    this.code = String(status);
  }
}

/** Where a refresh has got to. `throttled` and `expired` are answers, not errors — see below. */
export type RefreshState = 'idle' | 'refreshing' | 'throttled' | 'expired' | 'failed';

export interface EstateState {
  load: EstateLoadState;
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
  /**
   * The host-triggered refresh — asking the mesh to run a discovery pass *now* rather than waiting
   * for its schedule.
   *
   * It lives beside the artifacts it republishes rather than in a slice of its own, because that is
   * the only thing it is about. Its outcomes are deliberately four, not two: `throttled` is the
   * server's rate limit doing its job and reads as "not yet", not as "broken", and `expired` is a
   * session that ran out, which needs a sign-in, not a retry.
   */
  refresh: RefreshState;
  /** What to tell the reader about the last refresh. Null while idle or in flight. */
  refreshNote: string | null;
}

const initialState: EstateState = {
  load: 'idle',
  error: null,
  generatedAtUtc: null,
  services: [],
  snapshots: {},
  snapshotLoad: {},
  changed: [],
  refresh: 'idle',
  refreshNote: null,
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

/** What a failed load knows about itself: the reason to show, and the status that classifies it. */
export interface LoadFailure {
  message: string;
  /** Null when the request never got an answer at all — a refused connection, a DNS failure. */
  status: number | null;
}

const asLoadFailure = (error: unknown): LoadFailure => ({
  message: error instanceof Error ? error.message : String(error),
  status: error instanceof MeshFetchError ? error.status : null,
});

/**
 * The manifest fetch. `fetchJson` is injected as a thunk extra rather than imported, so tests drive
 * the store with a stub and never touch the network — the store is the unit under test, not fetch.
 *
 * The failure is converted to a rejection *value* rather than left as a thrown error, so the status
 * reaches the reducer as a number. The alternative — reading it back out of the message — is how a
 * "no catalog yet" empty state becomes a regex over English text.
 */
export const loadManifest = createAsyncThunk<
  Manifest,
  void,
  { extra: MeshApi; rejectValue: LoadFailure }
>('estate/loadManifest', async (_, { extra, rejectWithValue }) => {
  try {
    return await extra.getManifest();
  } catch (error) {
    return rejectWithValue(asLoadFailure(error));
  }
});

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

/** How a refused refresh is reported to the reader. */
interface RefreshFailure {
  state: Exclude<RefreshState, 'idle' | 'refreshing'>;
  note: string;
}

const refreshFailure = (error: unknown): RefreshFailure => {
  const status = error instanceof MeshFetchError ? error.status : null;
  // The server rate-limits refreshes on purpose — a discovery pass is expensive and two of them a
  // second apart answer the same question. "Not yet" is the correct reading, so it is worded as one.
  if (status === 429) return { state: 'throttled', note: 'Refreshed recently — try again shortly.' };
  // Behind an OIDC gate a session simply runs out. Retrying cannot help; signing in again can.
  if (status === 401) return { state: 'expired', note: 'Your session has expired — reload the page to sign in again.' };
  return {
    state: 'failed',
    note: error instanceof Error ? error.message : 'The refresh could not be started.',
  };
};

/**
 * Ask the mesh to run a discovery/aggregation pass now, then show what it produced.
 *
 * Two steps, because the POST only *starts* the pass — the point of the button is the new data, and
 * a refresh that left the page showing the old artifacts under a new "generated" timestamp would be
 * the same lie the artifact poll exists to avoid. The manifest and the catalog are re-read together
 * for the reason they always are: one aggregator run publishes both, and refreshing one alone puts
 * fresh statuses under a stale map.
 *
 * Both re-reads are the *silent* variants, so a refresh never blanks the estate it is refreshing:
 * if the pass succeeded but the re-read failed, the reader keeps the data they had.
 */
export const refreshEstate = createAsyncThunk<
  void,
  void,
  { extra: MeshApi; rejectValue: RefreshFailure }
>('estate/refreshEstate', async (_, { extra, dispatch, rejectWithValue }) => {
  if (!extra.requestRefresh) {
    return rejectWithValue({ state: 'failed', note: 'This mesh has no refresh endpoint.' });
  }
  try {
    await extra.requestRefresh();
  } catch (error) {
    return rejectWithValue(refreshFailure(error));
  }
  await Promise.all([dispatch(refreshManifest()), dispatch(loadCatalog())]);
});

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
  /**
   * Optional: absent when no dispatch endpoint is configured, which disables the composer's send
   * button rather than hiding it. Throws {@link import('./composeSlice').MeshDispatchBlockedError}
   * when the mesh itself refused the dispatch (most commonly `MeshDispatchGate`'s Production check) —
   * as opposed to resolving with whatever the target service's own handler returned, however unhappy.
   */
  sendMessage?(message: {
    service: string;
    topic: string;
    headers: Record<string, string>;
    body: string;
  }): Promise<import('./composeSlice').ComposeResult>;
  /**
   * Optional: absent unless the host wired a refresh endpoint. Asks the mesh to run a discovery and
   * aggregation pass now instead of at its next scheduled one; it resolves when the mesh has
   * accepted the request, and the fresh artifacts are read back separately.
   *
   * Rejects with {@link MeshFetchError} so the caller can tell 429 (rate-limited, try again shortly)
   * and 401 (the session ran out) apart from a genuine failure.
   */
  requestRefresh?(): Promise<void>;
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
        // A 404 is not a failure. A mesh that has just been deployed has published no manifest yet,
        // and the reader needs to be told that — not shown "404 Not Found for manifest.json", which
        // is what a first-run deployment used to greet its owner with. Everything else — a refused
        // connection, a 500, a body that will not parse — is a real error and stays one, because
        // quietly rendering those as "nothing here yet" would hide a broken mesh behind an
        // encouraging sentence.
        if (action.payload?.status === 404) {
          state.load = 'empty';
          state.error = null;
          return;
        }
        state.load = 'failed';
        state.error = action.payload?.message ?? action.error.message ?? 'Failed to load the manifest';
      })
      .addCase(refreshManifest.fulfilled, (state, action) => {
        // A manifest arriving is the end of the empty state: the mesh has published its first pass,
        // whether that came from the poll or from the reader pressing Refresh.
        state.load = 'ready';
        state.error = null;
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
      })
      .addCase(refreshEstate.pending, (state) => {
        state.refresh = 'refreshing';
        state.refreshNote = null;
      })
      .addCase(refreshEstate.fulfilled, (state) => {
        state.refresh = 'idle';
        state.refreshNote = null;
      })
      .addCase(refreshEstate.rejected, (state, action) => {
        // Note the absence: nothing here touches `services`, `load` or `error`. A refresh that could
        // not be started is news about the refresh, not about the estate, and must never wipe data
        // already on the screen.
        state.refresh = action.payload?.state ?? 'failed';
        state.refreshNote = action.payload?.note ?? action.error.message ?? 'The refresh could not be started.';
      });
  },
});

export const { manifestRefreshed } = estateSlice.actions;
export default estateSlice.reducer;
