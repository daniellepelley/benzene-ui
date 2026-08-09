import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';
import type { IssueClassification } from '../../contracts';

/**
 * The live plane, kept deliberately separate from `estateSlice`.
 *
 * The estate is what services *declare* about themselves — a manifest published by the aggregator.
 * The fleet is what the collector has actually *observed*: heartbeats, traffic, failures. They have
 * different sources, different freshness, and different failure modes, and conflating them is how
 * the original UI ended up unable to say "declared healthy, but silent for six minutes".
 *
 * Above all, they fail independently: no collector configured is not an error, it is a service with
 * no live plane. `available: false` is a legitimate resting state, and the UI must render the
 * declared plane perfectly well without any of this.
 */

/** Heartbeat staleness, carried over from the original UI's FL_STALE_MS. */
export const HEARTBEAT_STALE_MS = 90_000;

export interface Heartbeat {
  service: string;
  lastSeenUtc: string;
}

export interface LiveIssue {
  id: string;
  service: string;
  topic?: string | null;
  classification: IssueClassification;
  message: string;
  observedAtUtc: string;
  count: number;
}

export interface TopicFlow {
  topic: string;
  service: string;
  success: number;
  failure: number;
}

export interface FleetSnapshot {
  heartbeats: Heartbeat[];
  issues: LiveIssue[];
  flows: TopicFlow[];
  observedAtUtc: string;
}

export type FleetLoad = 'idle' | 'probing' | 'live' | 'unavailable';

export interface FleetState {
  /** False until a collector answers. Absent is not broken — see the note above. */
  available: boolean;
  load: FleetLoad;
  error: string | null;
  observedAtUtc: string | null;
  heartbeats: Record<string, string>;
  issues: LiveIssue[];
  flows: TopicFlow[];
  /** Wall-clock the staleness calculations are relative to. Injected, never read from Date.now()
   *  inside a selector — a selector that reads the clock is untestable and un-memoisable. */
  now: number;
}

const initialState: FleetState = {
  available: false,
  load: 'idle',
  error: null,
  observedAtUtc: null,
  heartbeats: {},
  issues: [],
  flows: [],
  now: 0,
};

export const probeFleet = createAsyncThunk<FleetSnapshot | null, void, { extra: MeshApi }>(
  'fleet/probe',
  async (_, { extra }) => (extra.getFleet ? extra.getFleet() : null),
);

const fleetSlice = createSlice({
  name: 'fleet',
  initialState,
  reducers: {
    /**
     * The poll tick. Separate from the initial probe so a refresh never re-enters 'probing'.
     *
     * Receiving an observation *is* evidence the collector is live, so this asserts availability
     * rather than leaving it to whoever probed first — a snapshot arriving while `available` was
     * false would otherwise render as "no live plane" on top of live data.
     */
    fleetObserved(state, action: PayloadAction<FleetSnapshot>) {
      state.available = true;
      state.load = 'live';
      state.error = null;
      applySnapshot(state, action.payload);
    },
    /** Drives every staleness calculation. Tests set it; the app ticks it. */
    clockTicked(state, action: PayloadAction<number>) {
      state.now = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(probeFleet.pending, (state) => {
        state.load = 'probing';
        state.error = null;
      })
      .addCase(probeFleet.fulfilled, (state, action) => {
        if (!action.payload) {
          // No collector wired. Not a failure — the estate still renders.
          state.available = false;
          state.load = 'unavailable';
          return;
        }
        state.available = true;
        state.load = 'live';
        applySnapshot(state, action.payload);
      })
      .addCase(probeFleet.rejected, (state, action) => {
        state.available = false;
        state.load = 'unavailable';
        state.error = action.error.message ?? 'The collector could not be reached';
      });
  },
});

function applySnapshot(state: FleetState, snapshot: FleetSnapshot) {
  state.observedAtUtc = snapshot.observedAtUtc;
  state.issues = snapshot.issues;
  state.flows = snapshot.flows;
  for (const beat of snapshot.heartbeats) {
    state.heartbeats[beat.service] = beat.lastSeenUtc;
  }
}

export const { fleetObserved, clockTicked } = fleetSlice.actions;
export default fleetSlice.reducer;
