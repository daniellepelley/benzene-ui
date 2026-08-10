import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';
import type { FleetView, FleetViewServicesItem, FleetViewTopicsItem, FleetViewTracesItem, FleetViewWindow, MeshIssue } from '../../contracts';

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
 *
 * The state here IS the `FleetView` wire contract (`benzene:mesh:query:fleet`), stored as it
 * arrives. An earlier cut of this slice invented a friendlier shape — heartbeats, flows — and the
 * result was a library no real collector could drive: the adapter it needed did not exist, and the
 * three honesty channels the contract carries (`missingFeeds`, `window.countsWindowed`, absent
 * `lastSeen`) had nowhere to live. Storing the contract keeps them.
 */

/** Heartbeat staleness, carried over from the original UI's FL_STALE_MS. */
export const HEARTBEAT_STALE_MS = 90_000;

/** How often the app re-polls the collector. Lives here, not in the app shell, because the feed-health
 *  selector needs it to decide when a failed poll has gone on long enough to call the plane stale. */
export const FLEET_POLL_MS = 15_000;

/**
 * The issue inbox reasons over a fixed 24 hours, whatever window the reader picked.
 *
 * An overnight failure has to greet the morning check. Tying the inbox to a 15-minute picker means
 * the thing that broke at 3am is invisible at 9am, which is the one moment it most needs to be seen.
 */
export const INBOX_WINDOW = 'now-24h';

/**
 * And on its own, much slower, cadence.
 *
 * A 24-hour window makes this the widest scan on the page. On a trace-backed plane that is a
 * `GetTraceSummaries` over a full day, billed per trace scanned, so polling it at the live cadence
 * is both expensive and pointless — a day-wide view does not need minute-fresh data.
 */
export const INBOX_POLL_MS = 300_000;

export type FleetService = FleetViewServicesItem;
export type FleetTopic = FleetViewTopicsItem;
export type FleetTrace = FleetViewTracesItem;
export type FleetIssue = MeshIssue;
export type FleetWindow = FleetViewWindow;

/**
 * The query body of `benzene:mesh:query:fleet`.
 *
 * `window.from` is Grafana relative-time grammar (`now-15m`), not a millisecond count — the server
 * resolves it against its own clock, which is the only clock both sides agree on.
 */
export interface FleetQuery {
  window?: { from: string; to?: string };
  /**
   * A cost hint, never a contract change. On a trace-backed plane, flows cost a trace scan over the
   * whole window and are billed per trace scanned, so a wide-window counts-only poll sets this false.
   * A reader must still tolerate an empty flows list either way — that was already the degraded case.
   */
  includeFlows?: boolean;
}

export type FleetLoad = 'idle' | 'probing' | 'live' | 'unavailable';

export interface FleetState {
  /** False until a collector answers. Absent is not broken — see the note above. */
  available: boolean;
  load: FleetLoad;
  error: string | null;
  generatedAt: string | null;
  services: FleetService[];
  topics: FleetTopic[];
  traces: FleetTrace[];
  issues: FleetIssue[];
  /**
   * The 24-hour inbox, answered by its own slow poll and never by the picker's window.
   *
   * Held apart from `issues` on purpose: `issues` is whatever the picked window returned, and the
   * inbox is the standing "what has gone wrong today" list. Letting the picker narrow the inbox is
   * how an overnight failure becomes invisible by morning.
   */
  inboxIssues: FleetIssue[];
  /**
   * The window the view answers, when the query carried one.
   *
   * `countsWindowed: false` is the load-bearing case: the flows honour the picked window but the
   * counts answer a different one (cumulative since collector start, or the usage feed's own baked
   * window). That is a real number answering a different question — never blanked, never relabelled.
   */
  window: FleetWindow | null;
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
   * All three are milliseconds, taken from the observation itself (`generatedAt`) or from the last
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
  generatedAt: null,
  services: [],
  topics: [],
  traces: [],
  issues: [],
  inboxIssues: [],
  window: null,
  now: 0,
  lastOkAt: null,
  lastFailAt: null,
  lastActivityAt: null,
};

export const probeFleet = createAsyncThunk<
  FleetView | null,
  void,
  { extra: MeshApi; state: { view: { rangeMs: number } } }
>('fleet/probe', async (_, { extra, getState }) =>
  extra.getFleet ? extra.getFleet({ window: { from: relativeFrom(getState().view.rangeMs) } }) : null,
);

/**
 * The inbox poll: a fixed 24 hours, counts only.
 *
 * `includeFlows: false` is a real cost control, not a micro-optimisation. On a trace-backed plane
 * flows cost a scan of the whole window and are billed per trace scanned, and the inbox reasons over
 * counts — so asking for a day of flows it will not read is paying for nothing. Flow evidence comes
 * from the range-windowed poll instead.
 */
export const pollInbox = createAsyncThunk<FleetView | null, void, { extra: MeshApi }>(
  'fleet/pollInbox',
  async (_, { extra }) =>
    extra.getFleet ? extra.getFleet({ window: { from: INBOX_WINDOW }, includeFlows: false }) : null,
);

/**
 * A picked window as the wire's relative-time grammar.
 *
 * Sending `now-15m` rather than a resolved timestamp is deliberate: the server resolves it against
 * its own clock, so a client whose clock is skewed asks for the window it means rather than one
 * silently shifted by the skew.
 */
export function relativeFrom(rangeMs: number): string {
  const minutes = Math.round(rangeMs / 60_000);
  if (minutes % (60 * 24) === 0) return `now-${minutes / (60 * 24)}d`;
  if (minutes % 60 === 0) return `now-${minutes / 60}h`;
  return `now-${minutes}m`;
}

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
    fleetObserved(state, action: PayloadAction<FleetView>) {
      state.available = true;
      state.load = 'live';
      state.error = null;
      applyView(state, action.payload);
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
        applyView(state, action.payload);
      })
      // The inbox is a second, independent question. A failure here must not mark the whole live
      // plane unavailable — the 15-second poll is the one that decides that.
      .addCase(pollInbox.fulfilled, (state, action) => {
        if (action.payload) state.inboxIssues = action.payload.issues;
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

function applyView(state: FleetState, view: FleetView) {
  state.generatedAt = view.generatedAt;
  state.services = view.services;
  state.topics = view.topics;
  state.traces = view.traces;
  state.issues = view.issues;
  state.window = view.window ?? null;

  const observedAt = Date.parse(view.generatedAt);
  if (!Number.isNaN(observedAt)) {
    state.lastOkAt = observedAt;
    // Counts, not flow rows: flows are sampled and capped, so an empty trace list is not evidence of
    // no traffic, but a non-zero invocation count is evidence of traffic. Only the positive
    // direction is safe — and a count from a topic that declares `stats` missing is not a count at
    // all, it is the contract's non-nullable default showing through.
    const sawTraffic = view.topics.some(
      (t) => !t.missingFeeds.includes('stats') && t.invocations > 0,
    );
    // Heartbeats deliberately do NOT count. They ride the mesh's own feed, so a fleet heartbeating
    // into a broken exporter is exactly the case the blind state exists to catch — counting them
    // would make that state unreachable.
    if (sawTraffic || view.traces.length > 0) state.lastActivityAt = observedAt;
  }
}

export const { fleetObserved, clockTicked } = fleetSlice.actions;
export default fleetSlice.reducer;
