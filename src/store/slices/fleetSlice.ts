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

/** How often the app re-polls the collector. Lives here, not in the app shell, because the feed-health
 *  selector needs it to decide when a failed poll has gone on long enough to call the plane stale. */
export const FLEET_POLL_MS = 15_000;

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
  /**
   * Feed health: the three facts needed to tell "the estate is quiet" apart from "I am blind".
   *
   * A dashboard that cannot make that distinction is worse than none, because silence then reads as
   * health. `lastActivityAt` is what breaks the tie — a collector answering every poll that has
   * never once reported traffic, while the catalog declares topics, is far more likely a broken
   * exporter than an idle estate, and the UI has to say so rather than render a calm green.
   *
   * All three are milliseconds, taken from the observation itself (`observedAtUtc`) or from the last
   * ticked clock on failure — never from `Date.now()` in here, for the same reason as `now`.
   */
  lastOkAt: number | null;
  lastFailAt: number | null;
  lastActivityAt: number | null;
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
  lastOkAt: null,
  lastFailAt: null,
  lastActivityAt: null,
};

export const probeFleet = createAsyncThunk<
  FleetSnapshot | null,
  void,
  { extra: MeshApi; state: { view: { rangeMs: number } } }
>('fleet/probe', async (_, { extra, getState }) =>
  extra.getFleet ? extra.getFleet({ rangeMs: getState().view.rangeMs }) : null,
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
        // `now` is the last ticked clock. Zero (never ticked) would date the failure to 1970 and
        // make every age nonsensical, so a failure before the first tick simply isn't timestamped.
        if (state.now > 0) state.lastFailAt = state.now;
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

  const observedAt = Date.parse(snapshot.observedAtUtc);
  if (!Number.isNaN(observedAt)) {
    state.lastOkAt = observedAt;
    // Counts, not flow rows: flows are sampled and capped, so an empty flow list is not evidence of
    // no traffic, but a non-zero count is evidence of traffic. Only the positive direction is safe.
    //
    // Heartbeats deliberately do NOT count. They travel on the mesh's own feed, so a fleet that
    // heartbeats while no domain traffic is observed is exactly the broken-exporter case this is
    // here to catch — counting them would make the blind state unreachable.
    if (snapshot.flows.some((f) => f.success + f.failure > 0)) state.lastActivityAt = observedAt;
  }
}

export const { fleetObserved, clockTicked } = fleetSlice.actions;
export default fleetSlice.reducer;
