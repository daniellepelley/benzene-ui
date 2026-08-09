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

// ── Catalog: topics, topology, usage ────────────────────────────────────────────────────────────

import type { TopicsTopicsItem, TopologyEdgesItem, UsageEntriesItem } from '../contracts';

/**
 * The statuses that count as success, carried over verbatim from the original UI's FL_SUCCESS.
 * Anything else — including statuses added to the vocabulary later — is a failure, which is the
 * safe direction: a new status silently counting as success would hide a regression.
 */
const SUCCESS_STATUSES = new Set(['ok', 'created', 'accepted', 'updated', 'deleted', 'ignored']);
export const isSuccessStatus = (status: string | null | undefined) =>
  status != null && SUCCESS_STATUSES.has(status);

export const selectCatalogLoad = (s: RootState) => s.catalog.load;
const selectTopicsRaw = (s: RootState) => s.catalog.topics?.topics ?? [];
const selectEdgesRaw = (s: RootState) => s.catalog.topology?.edges ?? [];
const selectUsageRaw = (s: RootState) => s.catalog.usage?.entries ?? [];

/**
 * Plain functions, not createSelector. These only narrow a type — the result IS the input, so
 * memoising them adds a cache lookup and a dev-mode identity warning while saving nothing. Reselect
 * is for derivation; extraction is just a function.
 */
export const selectTopics = (s: RootState) => selectTopicsRaw(s) as TopicsTopicsItem[];
export const selectEdges = (s: RootState) => selectEdgesRaw(s) as TopologyEdgesItem[];

/** Topics filtered by the same box that filters services — one filter, both lists. */
export const selectVisibleTopics = createSelector(
  [selectTopics, selectFilter],
  (topics, filter) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return topics;
    return topics.filter((t) => t.topic.toLowerCase().includes(needle));
  },
);

export interface TopicTraffic {
  success: number;
  failure: number;
  total: number;
  /** null when no usage source is wired — distinct from zero traffic, which is a real finding. */
  observed: boolean;
}

/** Traffic for one topic, summed across services, transports and statuses. */
export const selectTrafficForTopic = createSelector(
  [selectUsageRaw, (_: RootState, topic: string) => topic],
  (entries, topic): TopicTraffic => {
    const rows = (entries as UsageEntriesItem[]).filter((e) => e.topic === topic);
    let success = 0;
    let failure = 0;
    for (const row of rows) {
      if (isSuccessStatus(row.status)) success += row.count;
      else failure += row.count;
    }
    return { success, failure, total: success + failure, observed: rows.length > 0 };
  },
);

/** Every edge touching one service, in both directions. */
export const selectEdgesForService = createSelector(
  [selectEdges, (_: RootState, service: string) => service],
  (edges, service) => ({
    outbound: edges.filter((e) => e.client === service),
    inbound: edges.filter((e) => e.server === service),
  }),
);

export const selectTopicsForService = createSelector(
  [selectTopics, (_: RootState, service: string) => service],
  (topics, service) => ({
    consumes: topics.filter((t) => t.consumers?.some((c) => c.service === service)),
    produces: topics.filter((t) => t.producers?.some((p) => p.service === service)),
  }),
);

export const selectTopic = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic],
  (topics, topic) => topics.find((t) => t.topic === topic) ?? null,
);

/** Topics with a status the aggregator flagged — deprecation candidates and gaps. */
export const selectFlaggedTopics = createSelector([selectTopics], (topics) =>
  topics.filter((t) => t.status != null),
);

// ── Annotations ─────────────────────────────────────────────────────────────────────────────────

export const selectThread = createSelector(
  [(s: RootState) => s.annotations.items, (_: RootState, entity: string) => entity],
  (items, entity) =>
    items
      .filter((a) => a.entity === entity)
      .slice()
      .sort((a, b) => Date.parse(a.createdAtUtc) - Date.parse(b.createdAtUtc)),
);

export const selectCanPost = (s: RootState) =>
  s.annotations.draft.trim().length > 0 && s.annotations.post !== 'posting';
