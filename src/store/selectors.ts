import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { ManifestService, Rag, ServiceStatus } from '../contracts';

/** Declared status → RAG. The single place the mapping lives; the old UI spread it across classes. */
const STATUS_RAG: Record<ServiceStatus, Rag> = {
  healthy: 'green',
  degraded: 'amber',
  unhealthy: 'red',
  unreachable: 'gone',
};

export const ragForStatus = (status: ServiceStatus): Rag => STATUS_RAG[status];

/** Glyphs carried over verbatim from mesh-ui.html's RAG_GLYPH, so the visual language is unchanged. */
export const RAG_GLYPH: Record<Rag, string> = { red: '▲', amber: '◆', green: '●', gone: '○' };

export const selectLoad = (s: RootState) => s.estate.load;
export const selectError = (s: RootState) => s.estate.error;
export const selectFilter = (s: RootState) => s.view.filter;
export const selectPage = (s: RootState) => s.view.page;
export const selectSelected = (s: RootState) => s.view.selected;
const selectServices = (s: RootState) => s.estate.services;
const selectExpanded = (s: RootState) => s.view.expandedServices;

/** The filtered estate, memoised. Filtering is state-derived, so it is testable without a DOM. */
export const selectVisibleServices = createSelector(
  [selectServices, selectFilter],
  (services, filter): ManifestService[] => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return services;
    return services.filter((s) => s.name.toLowerCase().includes(needle));
  },
);

export const selectIsExpanded = (name: string) => (s: RootState) =>
  s.view.expandedServices.includes(name);

/**
 * The estate roll-up the fleet header shows. Derived, never stored — there is exactly one definition
 * of "how many are unhealthy", and both the header and any consumer's own header read it.
 */
export const selectEstateSummary = createSelector([selectServices], (services) => {
  const counts: Record<Rag, number> = { red: 0, amber: 0, green: 0, gone: 0 };
  let drift = 0;
  for (const s of services) {
    counts[ragForStatus(s.status)] += 1;
    if (s.contractDrift) drift += 1;
  }
  return { total: services.length, counts, drift, worst: worstOf(counts) };
});

/** Worst-first, so a single red outranks any number of ambers. */
function worstOf(counts: Record<Rag, number>): Rag | null {
  if (counts.red > 0) return 'red';
  if (counts.amber > 0) return 'amber';
  if (counts.gone > 0) return 'gone';
  return counts.green > 0 ? 'green' : null;
}

export const selectExpandedCount = createSelector([selectExpanded], (e) => e.length);

// ── Live plane ──────────────────────────────────────────────────────────────────────────────────
// Everything below derives from fleetSlice. Note that no selector reads the clock: `now` is state,
// set by an action, which is what makes staleness testable without faking timers.

import { HEARTBEAT_STALE_MS, type LiveIssue } from './slices/fleetSlice';

export const selectFleetAvailable = (s: RootState) => s.fleet.available;
export const selectFleetLoad = (s: RootState) => s.fleet.load;
const selectHeartbeats = (s: RootState) => s.fleet.heartbeats;
const selectNow = (s: RootState) => s.fleet.now;
const selectIssues = (s: RootState) => s.fleet.issues;

export type Liveness = 'live' | 'stale' | 'silent';

/**
 * A service's observed liveness — distinct from its declared status.
 *
 * 'silent' means no heartbeat has ever arrived, which is NOT the same as stale: a service that never
 * reported may simply not have the reporting middleware wired. The UI must not paint that as a fault.
 */
export const selectLiveness = createSelector(
  [selectHeartbeats, selectNow, (_: RootState, service: string) => service],
  (heartbeats, now, service): Liveness => {
    const lastSeen = heartbeats[service];
    if (!lastSeen) return 'silent';
    const age = now - Date.parse(lastSeen);
    return age > HEARTBEAT_STALE_MS ? 'stale' : 'live';
  },
);

/** Issues for one service, newest first. */
export const selectIssuesForService = createSelector(
  [selectIssues, (_: RootState, service: string) => service],
  (issues, service): LiveIssue[] =>
    issues
      .filter((i) => i.service === service)
      .slice()
      .sort((a, b) => Date.parse(b.observedAtUtc) - Date.parse(a.observedAtUtc)),
);

/**
 * The inbox roll-up. Counts *occurrences*, not distinct issues — one issue seen 400 times is a
 * bigger problem than four seen once, and the original UI's feed conflated them.
 */
export const selectIssueSummary = createSelector([selectIssues], (issues) => {
  const byClassification: Record<string, number> = {};
  let occurrences = 0;
  for (const issue of issues) {
    byClassification[issue.classification] = (byClassification[issue.classification] ?? 0) + issue.count;
    occurrences += issue.count;
  }
  return { distinct: issues.length, occurrences, byClassification };
});

/**
 * Services that say they are healthy but have gone quiet. The single most useful thing the live
 * plane adds, and impossible to express while the two planes share one slice.
 */
export const selectDivergences = createSelector(
  [(s: RootState) => s.estate.services, selectHeartbeats, selectNow, selectFleetAvailable],
  (services, heartbeats, now, available) => {
    if (!available) return [];
    return services
      .filter((s) => s.status === 'healthy')
      .filter((s) => {
        const lastSeen = heartbeats[s.name];
        // Never-reported is not a divergence — it is an unwired service, not a lying one.
        return lastSeen !== undefined && now - Date.parse(lastSeen) > HEARTBEAT_STALE_MS;
      })
      .map((s) => s.name);
  },
);
