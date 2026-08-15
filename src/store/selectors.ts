import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { ManifestService, Rag, ServiceStatus } from '../contracts';
import { edgeLivenessOf } from '../contracts/mesh';

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
export const selectSelectedService = (s: RootState) => s.view.selectedService;
const selectServices = (s: RootState) => s.estate.services;
const selectExpanded = (s: RootState) => s.view.expandedServices;

/** The filtered estate, memoised. Filtering is state-derived, so it is testable without a DOM. */
const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, gone: 2, green: 3 };

export const selectVisibleServices = createSelector(
  [selectServices, selectFilter],
  (services, filter): ManifestService[] => {
    const needle = filter.trim().toLowerCase();
    const matching = needle
      ? services.filter((s) => s.name.toLowerCase().includes(needle))
      : services;
    // Worst first, alphabetical within a tier. Manifest order is an arbitrary answer to "where is
    // the problem", and a reader scanning top-down should meet it immediately.
    return matching
      .slice()
      .sort(
        (a, b) =>
          RAG_ORDER[ragForStatus(a.status)] - RAG_ORDER[ragForStatus(b.status)] ||
          a.name.localeCompare(b.name),
      );
  },
);

export const selectIsExpanded = (name: string) => (s: RootState) =>
  s.view.expandedServices.includes(name);

/** Services whose status moved on the last refresh. Empty on first load, by design. */
export const selectChangedServices = (s: RootState) => s.estate.changed;

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

import { HEARTBEAT_STALE_MS, type FleetIssue, type FleetService } from './slices/fleetSlice';

export const selectFleetAvailable = (s: RootState) => s.fleet.available;
export const selectFleetLoad = (s: RootState) => s.fleet.load;
const selectFleetServices = (s: RootState) => s.fleet.services;
const selectFleetTopics = (s: RootState) => s.fleet.topics;
const selectNow = (s: RootState) => s.fleet.now;
/**
 * The inbox, windowed on `lastSeen`.
 *
 * The collector returns its issue map unfiltered — the contract is explicit that it is a merged map
 * and that readers window it themselves. Without that, the inbox shows every signature the collector
 * has ever merged, including ones fixed weeks ago, and a list nobody can trust gets ignored.
 */
const selectIssues = createSelector(
  [(s: RootState) => s.fleet.inboxIssues, (s: RootState) => s.fleet.issues, selectNow],
  (inbox, windowed, now): FleetIssue[] => {
    // Prefer the dedicated 24h poll; fall back to the picker's view until the first one lands.
    const source = inbox.length > 0 ? inbox : windowed;
    if (now === 0) return source; // clock not ticked yet — filtering would drop everything
    return source.filter((issue) => now - Date.parse(issue.lastSeen) <= INBOX_WINDOW_MS);
  },
);

/** The inbox window as milliseconds, for the client-side `lastSeen` filter. */
export const INBOX_WINDOW_MS = 24 * 60 * 60 * 1000;

export const selectFleetService = createSelector(
  [selectFleetServices, (_: RootState, service: string) => service],
  (services, service): FleetService | null => services.find((s) => s.service === service) ?? null,
);

export type Liveness = 'live' | 'stale' | 'silent';

/**
 * A service's observed liveness — distinct from its declared status.
 *
 * 'silent' means no live-time signal has ever arrived, which is NOT the same as stale: the service
 * may lack the reporting middleware, or the plane may simply not carry a live-time signal at all
 * (the composite plane's anonymous rows omit `lastSeen` by design). The UI must not paint either as
 * a fault. Note this reads an *absent* `lastSeen` — never a default epoch, which once serialised as
 * 0001-01-01 and read as "stale for two millennia".
 */
export const selectLiveness = createSelector(
  [selectFleetServices, selectNow, (_: RootState, service: string) => service],
  (services, now, service): Liveness => {
    const lastSeen = services.find((s) => s.service === service)?.lastSeen;
    if (!lastSeen) return 'silent';
    const age = now - Date.parse(lastSeen);
    return age > HEARTBEAT_STALE_MS ? 'stale' : 'live';
  },
);

/** The 24-hour inbox, for anything that renders the list itself. */
export const selectInboxIssues = createSelector([selectIssues], (issues) =>
  issues.slice().sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)),
);

/** Issues for one service, newest activity first. */
export const selectIssuesForService = createSelector(
  [selectIssues, (_: RootState, service: string) => service],
  (issues, service): FleetIssue[] =>
    issues
      .filter((i) => i.service === service)
      .slice()
      .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen)),
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
  [(s: RootState) => s.estate.services, selectFleetServices, selectNow, selectFleetAvailable],
  (declared, observed, now, available) => {
    if (!available) return [];
    return declared
      .filter((s) => s.status === 'healthy')
      .filter((s) => {
        const lastSeen = observed.find((o) => o.service === s.name)?.lastSeen;
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

/**
 * One shared empty array for every "absent artifact" fallback.
 *
 * `?? []` looks harmless and is not: it mints a new reference on every call, so any memoised selector
 * downstream of an unloaded artifact recomputes on every single store read and Reselect's dev-mode
 * stability check fires. One frozen constant makes absence a stable value.
 */
export const NONE: readonly never[] = Object.freeze([]);

const selectTopicsRaw = (s: RootState) => s.catalog.topics?.topics ?? NONE;
const selectEdgesRaw = (s: RootState) => s.catalog.topology?.edges ?? NONE;
const selectUsageRaw = (s: RootState) => s.catalog.usage?.entries ?? NONE;
const selectRemovedRaw = (s: RootState) => s.catalog.topics?.removedTopics ?? NONE;
const selectCompatibilityRaw = (s: RootState) => s.catalog.topics?.versionCompatibility ?? NONE;

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
  [selectTopics, (s: RootState) => s.view.showUtility, (_: RootState, service: string) => service],
  (topics, showUtility, service) => {
    // Every Benzene service consumes the same reserved topics. Listing them beside the domain ones
    // buries what this service is actually for — and every other traffic surface already hides them
    // behind the same toggle, so leaving them here was an inconsistency as much as noise.
    const visible = showUtility ? topics : topics.filter((t) => !t.reserved);
    return {
      consumes: visible.filter((t) => t.consumers?.some((c) => c.service === service)),
      produces: visible.filter((t) => t.producers?.some((p) => p.service === service)),
    };
  },
);

/**
 * The same, for the whole visible list, as ONE memoised array.
 *
 * Mapping the per-service selector inside the component mints a new array on every store read, which
 * makes react-redux re-render the list continuously — and say so, loudly, in development.
 */
export const selectVisibleServiceTopics = createSelector(
  [selectVisibleServices, selectTopics, (s: RootState) => s.view.showUtility],
  (services, topics, showUtility) => {
    const visible = showUtility ? topics : topics.filter((t) => !t.reserved);
    return services.map((service) => ({
      consumes: visible.filter((t) => t.consumers?.some((c) => c.service === service.name)),
      produces: visible.filter((t) => t.producers?.some((p) => p.service === service.name)),
    }));
  },
);

export const selectTopic = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic],
  (topics, topic) => topics.find((t) => t.topic === topic) ?? null,
);

/** Topics with a status the aggregator flagged — deprecation candidates and gaps. */
export const selectFlaggedTopics = createSelector([selectTopics], (topics) =>
  topics.filter((t) => t.status != null),
);

/** Every version of a topic the catalog carries, in declaration order. */
export const selectTopicEntries = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic],
  (topics, topic) => topics.filter((t) => t.topic === topic),
);

/** The HTTP routes a topic's consumers expose it on — the only place the wire binding is visible. */
export const selectHttpMappingsForTopic = createSelector(
  [selectTopicEntries],
  (entries) =>
    entries.flatMap((t) =>
      (t.consumers ?? []).flatMap((c) =>
        (c.httpMappings ?? []).map((m) => ({ service: c.service, method: m.method, path: m.path })),
      ),
    ),
);

// ── Version compatibility ───────────────────────────────────────────────────────────────────────

import type { TopicsVersionCompatibilityItem } from '../contracts';

/**
 * The aggregator's producer-vs-consumer version reconciliation for one topic, or null.
 *
 * Null is the common case and means "nothing to say": the aggregator emits an entry only for a topic
 * with more than one version in play or an outright skew. Absent is not "compatible" — a UI that
 * rendered a green "compatible" badge for every single-version topic would be inventing a check
 * nobody ran.
 */
export const selectVersionCompatibility = createSelector(
  [selectCompatibilityRaw, (_: RootState, topic: string) => topic],
  (rows, topic): TopicsVersionCompatibilityItem | null =>
    (rows as TopicsVersionCompatibilityItem[]).find((v) => v.topic === topic) ?? null,
);

// ── Utility traffic ─────────────────────────────────────────────────────────────────────────────

export const selectShowUtility = (s: RootState) => s.view.showUtility;

/**
 * Benzene's own plumbing topics. Since the 2026-07-25 rename every framework-owned topic carries the
 * `benzene:` prefix, so this is one prefix test plus the catalog's own `reserved` flag — no hardcoded
 * name list to go stale when a utility topic is added. `mesh:`/`$` are kept so a UI pointed at a
 * backend from before the rename still classifies its traffic correctly.
 */
export const isReservedTopicId = (topic: string | null | undefined) =>
  /^(benzene:|mesh:|\$)/i.test(topic ?? '');

/** `<missing>` is a recording gap, not a topic — never a name to show raw on a primary surface. */
export const MISSING_TOPIC = '<missing>';
export const topicLabel = (topic: string) =>
  topic === MISSING_TOPIC ? '(no topic recorded)' : topic;

export const selectIsUtilityTopic = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic],
  (topics, topic): boolean => {
    if (!topic) return false;
    if (isReservedTopicId(topic)) return true;
    if (topic === MISSING_TOPIC) return true;
    return topics.some((t) => t.topic === topic && t.reserved);
  },
);

/** The utility predicate as a plain function over an already-known catalog — used by the splits below. */
const utilityTest = (topics: TopicsTopicsItem[]) => (topic: string) =>
  isReservedTopicId(topic) || topic === MISSING_TOPIC || topics.some((t) => t.topic === topic && t.reserved);

// ── Per-service usage ───────────────────────────────────────────────────────────────────────────

export type ServiceUsageMode = 'none' | 'own' | 'fleet-wide';

export interface ServiceUsageSummary {
  /**
   * `none` — no usage feed is wired at all, so nothing can be said.
   * `own` — the feed attributes counts per service and these are this service's.
   * `fleet-wide` — the feed has no service dimension, so these are fleet-wide counts for the topics
   *   this service handles. Shown, but never passed off as the service's own.
   */
  mode: ServiceUsageMode;
  entries: UsageEntriesItem[];
  /** Utility rows excluded from `entries` while `showUtility` is off — stated, never silently dropped. */
  hidden: { entries: number; messages: number };
  /** True when every row the feed had for this service was benzene plumbing. Not the same as none. */
  allUtility: boolean;
}

export const selectUsageForService = createSelector(
  [selectUsageRaw, selectTopics, selectShowUtility, (s: RootState) => s.catalog.usage != null,
    (_: RootState, service: string) => service],
  (rows, topics, showUtility, feedWired, service): ServiceUsageSummary => {
    if (!feedWired) return { mode: 'none', entries: [], hidden: { entries: 0, messages: 0 }, allUtility: false };

    const entries = rows as UsageEntriesItem[];
    const mine = entries.filter((e) => e.service === service);
    // A feed that attributes ANY row to a service can attribute this one; seeing nothing for this
    // service is then a real observation ("wired, nothing seen"), not a missing dimension.
    const attributesServices = entries.some((e) => e.service != null);

    let mode: ServiceUsageMode;
    let candidates: UsageEntriesItem[];
    if (mine.length > 0 || attributesServices) {
      mode = 'own';
      candidates = mine;
    } else {
      mode = 'fleet-wide';
      const handled = new Set(
        topics
          .filter((t) => (t.consumers ?? []).some((c) => c.service === service))
          .map((t) => t.topic),
      );
      candidates = entries.filter((e) => handled.has(e.topic));
    }

    const isUtility = utilityTest(topics);
    const kept: UsageEntriesItem[] = [];
    const hidden = { entries: 0, messages: 0 };
    for (const row of candidates) {
      if (!showUtility && isUtility(row.topic)) {
        hidden.entries += 1;
        hidden.messages += row.count;
      } else kept.push(row);
    }

    return {
      mode,
      entries: kept,
      hidden,
      allUtility: kept.length === 0 && hidden.entries > 0,
    };
  },
);

/** Sums usage rows per distinct value of one dimension. A null dimension stays visible as
 *  "(unattributed)" — a partially-dimensioned feed is a data gap to surface, never one to guess at. */
export const usageGroups = (entries: UsageEntriesItem[], dimension: 'topic' | 'service' | 'transport' | 'status') => {
  const sums = new Map<string, number>();
  for (const entry of entries) {
    const key = entry[dimension] ?? '(unattributed)';
    sums.set(key, (sums.get(key) ?? 0) + entry.count);
  }
  return [...sums.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

/** Compact count formatting, carried over verbatim from the original UI's fmtCount. */
export const formatCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
};

/** Coarse relative age. Exact enough for "is this stale", vague enough not to imply precision. */
export const formatAge = (ms: number): string => {
  if (ms < 0) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

// ── Service self-description ────────────────────────────────────────────────────────────────────

export interface ServiceDescription {
  /** From the service's own published spec. Best-effort: an unparseable spec simply has none. */
  description: string | null;
  version: string | null;
  fetchedAtUtc: string | null;
  /** Present only when the aggregator flagged drift AND both hashes are known. */
  drift: { previous: string; current: string } | null;
}

const shortHash = (hash: string) => `${hash.slice(0, 12)}…`;

/**
 * What a service says about itself, parsed from the verbatim spec the aggregator stored.
 *
 * Parsing here rather than in the component is the whole point of the state rule: `JSON.parse` on a
 * field of unknown shape is derivation, it can throw, and it should be memoised — three reasons it
 * does not belong in a render function.
 */
export const selectServiceAbout = createSelector(
  [(s: RootState) => s.estate.snapshots, (_: RootState, service: string) => service],
  (snapshots, service): ServiceDescription | null => {
    const snapshot = snapshots[service];
    if (!snapshot) return null;

    let description: string | null = null;
    let version: string | null = null;
    try {
      const spec = JSON.parse(snapshot.specJson ?? 'null') as { info?: { description?: string; version?: string } } | null;
      description = spec?.info?.description ?? null;
      version = spec?.info?.version ?? null;
    } catch {
      // Not JSON, or a shape without an info block. The rest of the panel still renders.
    }

    const drift =
      snapshot.contractDrift && snapshot.specHash && snapshot.previousSpecHash
        ? { previous: shortHash(snapshot.previousSpecHash), current: shortHash(snapshot.specHash) }
        : null;

    // `snapshot.error` is deliberately absent: a failed fetch is a health fact, and HealthChecks is
    // where it means something (it explains the missing checks). Two homes for one message is how a
    // page ends up saying "Connection refused" twice.
    return { description, version, fetchedAtUtc: snapshot.fetchedAtUtc, drift };
  },
);

// ── Feed health ─────────────────────────────────────────────────────────────────────────────────

import { FLEET_POLL_MS } from './slices/fleetSlice';

export type FeedHealthKind = 'ok' | 'warn' | 'bad';

export interface FeedHealth {
  kind: FeedHealthKind;
  text: string;
}

const selectDomainTopicCount = createSelector(
  [selectTopics],
  (topics) => topics.filter((t) => !t.reserved).length,
);

/**
 * Whether the live plane can be believed — the difference between "the estate is quiet" and
 * "I am blind", which is the single most important thing a live dashboard has to be honest about.
 *
 * Null means there is no live plane at all (the static floor), which is a different statement again
 * and renders nothing rather than a reassuring green line.
 */
export const selectFeedHealth = createSelector(
  [
    selectFleetAvailable,
    (s: RootState) => s.fleet.lastOkAt,
    (s: RootState) => s.fleet.lastFailAt,
    (s: RootState) => s.fleet.lastActivityAt,
    selectNow,
    selectDomainTopicCount,
  ],
  (available, lastOk, lastFail, lastActivity, now, declaredTopics): FeedHealth | null => {
    if (!available && lastOk == null && lastFail == null) return null; // no live plane wired

    if (lastOk == null) {
      return lastFail == null
        ? null
        : {
            kind: 'bad',
            text: `live plane unreachable — no successful poll yet (last attempt ${formatAge(now - lastFail)} ago); retrying`,
          };
    }

    if (lastFail != null && lastFail > lastOk && now - lastOk > 3 * FLEET_POLL_MS) {
      return {
        kind: 'bad',
        text: `live plane unreachable — last successful poll ${formatAge(now - lastOk)} ago; the live data shown is stale`,
      };
    }

    // Blind: the collector answers but has never once reported traffic while the catalog declares
    // topics. In that state silence is not evidence of anything — least of all of health.
    if (lastActivity == null && declaredTopics > 0) {
      return {
        kind: 'warn',
        text: `live plane connected, but no traffic has been observed since this page loaded (${declaredTopics} topics declared) — if traffic is flowing, check the exporter wiring`,
      };
    }

    return {
      kind: 'ok',
      text:
        `live · polled ${formatAge(now - lastOk)} ago` +
        (lastActivity != null ? ` · last activity ${formatAge(now - lastActivity)} ago` : ' · no activity observed yet'),
    };
  },
);

// ── Value / retirement ──────────────────────────────────────────────────────────────────────────

export type RetirementTier = 'candidate' | 'verify' | 'ok';

export interface RetirementCandidate {
  entry: TopicsTopicsItem;
  /** null when no usage feed is wired — the difference between unmeasured and measured-at-zero. */
  usageTotal: number | null;
  /** Why this topic landed in this tier. The row exists to defend a decision, so it carries its case. */
  evidence: string[];
}

export interface RetirementGroup {
  tier: RetirementTier;
  rag: Rag;
  label: string;
  sub: string;
  rows: RetirementCandidate[];
}

export interface RemovedTopicRow {
  topic: string;
  version: string;
}

export interface RetirementView {
  /** False when no usage feed is wired, which caps what any of this can prove. */
  feedWired: boolean;
  removed: RemovedTopicRow[];
  groups: RetirementGroup[];
}

const TIER_DEFS: { tier: RetirementTier; rag: Rag; label: string; sub: string }[] = [
  {
    tier: 'candidate',
    rag: 'red',
    label: 'Retirement candidates',
    sub: 'Showing no sign of use — the evidence to defend a retirement decision, per row.',
  },
  {
    tier: 'verify',
    rag: 'amber',
    label: 'Verify externally',
    sub: "Involves parties outside this fleet's own declarations — confirm with them before acting.",
  },
  {
    tier: 'ok',
    rag: 'green',
    label: 'No retirement signal',
    sub: 'Actively used, or no evidence of disuse.',
  },
];

/**
 * The value view: which topics the estate could retire, and the evidence for each.
 *
 * The load-bearing distinction is between *no traffic observed* and *no way to observe traffic*.
 * Without a usage feed, "unused" cannot be proven at all, and every conclusion here degrades to a
 * structural one — which the view says out loud rather than quietly ranking on absent data.
 */
export const selectRetirementView = createSelector(
  [selectTopics, selectRemovedRaw, selectUsageRaw,
    (s: RootState) => s.catalog.usage != null, selectShowUtility],
  (topics, removedRaw, usageRows, feedWired, showUtility): RetirementView => {
    const entries = usageRows as UsageEntriesItem[];
    const isUtility = utilityTest(topics);

    const totalFor = (topic: string, version: string | null) =>
      entries
        .filter((e) => e.topic === topic && (version == null || e.version == null || e.version === version))
        .reduce((sum, e) => sum + e.count, 0);

    const removed = (removedRaw as RemovedTopicRow[]).filter((r) => showUtility || !isUtility(r.topic));

    const byTier: Record<RetirementTier, RetirementCandidate[]> = { candidate: [], verify: [], ok: [] };
    for (const entry of topics.filter((t) => !t.reserved)) {
      const usageTotal = feedWired ? totalFor(entry.topic, entry.version || null) : null;
      const consumers = (entry.consumers ?? []).length;
      const evidence: string[] = [];
      let tier: RetirementTier;

      if (entry.status === 'gap') {
        tier = 'verify';
        evidence.push('produced outside this fleet (gap)');
        if (usageTotal === 0) evidence.push('no traffic observed');
      } else if (usageTotal != null && usageTotal > 0) {
        tier = 'ok';
      } else if (consumers === 0 || usageTotal === 0) {
        tier = 'candidate';
        if (consumers === 0) evidence.push('no declared consumers');
        if (usageTotal === 0) evidence.push('no traffic observed while the usage feed is wired');
      } else {
        tier = 'ok';
        evidence.push('declared consumers, no usage feed to check against');
      }

      // mesh.md §4.2: a declared edge no trace has ever exercised is a decommission *candidate* in
      // its own right, independent of the usage-feed tiering above (a topic can carry real traffic
      // from most of its declared consumers and still have one nobody has ever seen call it).
      // Additive evidence only — it never changes the tier, and stays silent entirely when the
      // aggregator hasn't projected the signal (`edgeLivenessOf` returns 'unknown' for every peer).
      const unobservedConsumers = (entry.consumers ?? [])
        .filter((c) => edgeLivenessOf(entry.consumerActivity?.[c.service]) === 'unobserved')
        .map((c) => c.service);
      const unobservedProducers = (entry.producers ?? [])
        .filter((p) => edgeLivenessOf(entry.providerActivity?.[p.service]) === 'unobserved')
        .map((p) => p.service);
      if (unobservedConsumers.length > 0) {
        evidence.push(`declared but never observed consuming: ${unobservedConsumers.join(', ')}`);
      }
      if (unobservedProducers.length > 0) {
        evidence.push(`declared but never observed producing: ${unobservedProducers.join(', ')}`);
      }

      byTier[tier].push({ entry, usageTotal, evidence });
    }

    // Least-used first within a tier, so the strongest candidates float up; unmeasured sorts first
    // because "cannot be proven used" is the weaker position of the two.
    for (const rows of Object.values(byTier)) {
      rows.sort((a, b) => {
        const av = a.usageTotal ?? -1;
        const bv = b.usageTotal ?? -1;
        return av - bv || a.entry.topic.localeCompare(b.entry.topic);
      });
    }

    return {
      feedWired,
      removed,
      groups: TIER_DEFS.map((def) => ({ ...def, rows: byTier[def.tier] })).filter((g) => g.rows.length > 0),
    };
  },
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

// ── Compose ─────────────────────────────────────────────────────────────────────────────────────

import { exampleFromSchema, inboundSchema } from './exampleFromSchema';
import { RAW_TRANSPORT } from './slices/composeSlice';

/**
 * Every distinct service that produces a topic, across its versions — `ComposePage`'s way of
 * resolving *which* service to dispatch to when it's entered from a topic rather than a service (a
 * topic can have more than one producer, or none listed at all, so this is an answer to check, not
 * one to assume).
 */
export const selectProducerServicesForTopic = createSelector(
  [selectTopicEntries],
  (entries): string[] => {
    const services = new Set<string>();
    for (const t of entries) {
      for (const p of t.producers ?? []) services.add(p.service);
    }
    return [...services].sort();
  },
);

/** Every version of a topic, sorted by version string — the payload picker's options. */
export const selectTopicVersions = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic],
  (topics, topic) =>
    topics
      .filter((t) => t.topic === topic && !t.reserved)
      .slice()
      .sort((a, b) => (a.version || '').localeCompare(b.version || '')),
);

/**
 * Transports a topic can actually be sent over, derived from its consumers' HTTP mappings. The raw
 * benzene-message transport is always offered — it is the one every Benzene service understands.
 */
export const selectTransportsForTopic = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic],
  (topics, topic) => {
    const set = new Set<string>([RAW_TRANSPORT]);
    for (const t of topics.filter((x) => x.topic === topic)) {
      for (const consumer of t.consumers ?? []) {
        if ((consumer.httpMappings ?? []).length > 0) set.add('http');
      }
    }
    return [...set];
  },
);

/** The deterministic example body for the selected version, as pretty JSON. */
export const selectExampleBody = createSelector(
  [selectTopicVersions, (_: RootState, _topic: string, index: number) => index],
  (versions, index) => {
    const version = versions[index] ?? versions[0];
    if (!version) return '{}';
    const schema = inboundSchema(version);
    return JSON.stringify(exampleFromSchema(schema), null, 2);
  },
);

export interface ComposeValidity {
  bodyValid: boolean;
  headersValid: boolean;
  canSend: boolean;
}

/**
 * Whether the composed message is sendable. Parsing lives here rather than in the form, so "is this
 * valid JSON" is one memoised answer both the Send button and the error message read.
 *
 * `confirmed` gates `canSend` alongside the target and the JSON validity: dispatch fires a real
 * handler with real side-effects, so the Send button itself stays disabled until the reader has
 * acknowledged that — the same "component holds no state" rule that puts everything else here means
 * the acknowledgement is `compose.confirmed`, not a checkbox's own local state.
 */
export const selectComposeValidity = createSelector(
  [(s: RootState) => s.compose],
  (compose): ComposeValidity => {
    const parses = (text: string) => {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    };
    const bodyValid = parses(compose.bodyJson);
    const headersValid = parses(compose.headersJson);
    return {
      bodyValid,
      headersValid,
      canSend:
        bodyValid && headersValid && compose.send !== 'sending' && compose.confirmed
        && compose.topic != null && compose.service != null,
    };
  },
);

// ── Capabilities ────────────────────────────────────────────────────────────────────────────────

export const selectCapabilities = (s: RootState) => s.capabilities;
export const selectCanInvoke = (s: RootState) => s.capabilities.invoke;
export const selectCanAnnotate = (s: RootState) => s.capabilities.annotate;

// ── Test Console ────────────────────────────────────────────────────────────────────────────────

/**
 * Every non-reserved topic a service produces or consumes, for the Test Console's topic picker —
 * either direction is a legitimate thing to test (send a domain event a service consumes, or replay
 * one it produces), so this offers both rather than picking a side for the reader.
 */
export const selectComposableTopicsForService = createSelector(
  [selectTopicsForService],
  ({ consumes, produces }): TopicsTopicsItem[] => {
    const byTopic = new Map<string, TopicsTopicsItem>();
    for (const t of [...consumes, ...produces]) byTopic.set(t.topic, t);
    return [...byTopic.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  },
);

// ── The live window ─────────────────────────────────────────────────────────────────────────────

export const selectRangeMs = (s: RootState) => s.view.rangeMs;

/** The windows the picker offers. Carried over from the original UI's range control. */
export const RANGE_OPTIONS: { ms: number; label: string }[] = [
  { ms: 15 * 60_000, label: '15 minutes' },
  { ms: 60 * 60_000, label: '1 hour' },
  { ms: 6 * 60 * 60_000, label: '6 hours' },
  { ms: 24 * 60 * 60_000, label: '24 hours' },
];

export const rangeLabel = (ms: number): string =>
  RANGE_OPTIONS.find((o) => o.ms === ms)?.label ?? `${Math.round(ms / 60_000)} minutes`;

export interface TopicLive {
  /** False when no collector is wired — every field below is then meaningless, not zero. */
  available: boolean;
  /** null when the plane reported nothing for this topic, or declares its counts absent. Not zero. */
  observed: number | null;
  errors: number;
  /** null when the plane declares it cannot supply duration — the contract's non-nullable 0 is not a
   *  measurement, and rendering it as one invents a latency figure nobody measured. */
  avgDurationMs: number | null;
  /** Per-status breakdown as observed. Empty on a plane that does not carry it. */
  statusCounts: Record<string, number>;
  /** Services the collector actually saw handling this topic — observed, not declared. */
  services: string[];
  /** Dimensions the plane declares genuinely absent. Reduced is visible, never mistaken for empty. */
  missingFeeds: string[];
  rangeLabel: string;
  /**
   * The instant the *counts* actually cover from, when that is not the picked window.
   *
   * On a push-collector plane the counters are cumulative since process start; on a composite plane
   * they come from the usage feed's own baked window. Either way the flows honour the picked window
   * and the counts do not. That is a real number answering a different question — shown with its own
   * window attached, never blanked and never relabelled as the picked one.
   */
  countsSince: string | null;
}

/**
 * What the live plane observed for one topic, over the picked window.
 *
 * Deliberately separate from `selectTrafficForTopic`, which reads the aggregator's published usage
 * artifact. The two answer different questions from different feeds and cannot be re-windowed into
 * each other, so they are never summed and never shown without their window attached — a
 * range-labelled figure that is actually a baked-window figure is the most convincing kind of wrong
 * number.
 */
export const selectLiveForTopic = createSelector(
  [selectFleetTopics, selectFleetAvailable, selectRangeMs, (s: RootState) => s.fleet.window,
    (_: RootState, topic: string) => topic],
  (topics, available, ms, window, topic): TopicLive => {
    const rows = topics.filter((t) => t.topic === topic);
    const missingFeeds = [...new Set(rows.flatMap((r) => r.missingFeeds))];
    const statsAbsent = missingFeeds.includes('stats');
    const durationAbsent = missingFeeds.includes('duration');

    // Weighted, so a busy version is not averaged away by a quiet one.
    const weighted = rows.reduce((n, r) => n + r.avgDurationMs * Math.max(r.invocations, 1), 0);
    const weights = rows.reduce((n, r) => n + Math.max(r.invocations, 1), 0);

    return {
      available,
      observed: rows.length === 0 || statsAbsent ? null : rows.reduce((n, r) => n + r.invocations, 0),
      errors: statsAbsent ? 0 : rows.reduce((n, r) => n + r.errors, 0),
      avgDurationMs: rows.length === 0 || durationAbsent || weights === 0 ? null : weighted / weights,
      statusCounts: rows.reduce<Record<string, number>>((acc, r) => {
        for (const [status, count] of Object.entries(r.statusCounts)) {
          acc[status] = (acc[status] ?? 0) + count;
        }
        return acc;
      }, {}),
      services: [...new Set(rows.flatMap((r) => r.consumers))].sort(),
      missingFeeds,
      rangeLabel: rangeLabel(ms),
      countsSince: window && !window.countsWindowed ? (window.countsSince ?? null) : null,
    };
  },
);

// ── Untrusted URLs ──────────────────────────────────────────────────────────────────────────────

/**
 * An http(s) URL from an untrusted source, or null.
 *
 * `specUrl` and `healthUrl` come from a self-reported manifest, so a `javascript:` or `data:` URL
 * would execute on click if it were handed straight to an anchor — and `target="_blank"` does not
 * neutralise it. Anything that is not http or https is refused rather than rendered, which means a
 * hostile manifest entry costs the reader a missing link, not a script execution.
 */
export function safeHttpUrl(raw: string | null | undefined, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export interface ServiceLinkSet {
  specViewHref: string | null;
  rawSpecHref: string | null;
  healthHref: string | null;
}

/**
 * The links out of one service card, vetted for the deployment they will be clicked in.
 *
 * The spec-view href is relative on purpose: the mesh's spec page sits beside this one whether both
 * are static files or both are served from a pipeline, so a single href resolves in either. The two
 * self-reported URLs go through `safeHttpUrl`, because a manifest is written by the services
 * themselves and an unvetted `javascript:` href would execute on click.
 */
function serviceLinksFor(
  entry: ManifestService | undefined,
  manifestUrl: string | null,
  pageUrl: string,
): ServiceLinkSet {
  if (!entry) return { specViewHref: null, rawSpecHref: null, healthHref: null };

  const query = new URLSearchParams({ service: entry.name });
  if (manifestUrl) query.set('manifest', manifestUrl);
  query.set('mesh', pageUrl);

  return {
    specViewHref: `mesh-spec-ui.html?${query.toString()}`,
    rawSpecHref: safeHttpUrl(entry.specUrl, pageUrl),
    healthHref: safeHttpUrl(entry.healthUrl, pageUrl),
  };
}

const selectManifestUrl = (s: RootState) => s.capabilities.manifestUrl;

export const selectServiceLinks = createSelector(
  [(s: RootState) => s.estate.services, selectManifestUrl,
    (_: RootState, service: string) => service,
    (_s: RootState, _service: string, pageUrl: string) => pageUrl],
  (services, manifestUrl, service, pageUrl): ServiceLinkSet =>
    serviceLinksFor(services.find((s) => s.name === service), manifestUrl, pageUrl),
);

/**
 * The same, for the whole visible list, as ONE memoised array.
 *
 * Mapping the per-service selector inside the component would mint a new array on every store read
 * and make react-redux re-render the list continuously — which it says so, loudly, in development.
 */
export const selectVisibleServiceLinks = createSelector(
  [selectVisibleServices, selectManifestUrl, (_: RootState, pageUrl: string) => pageUrl],
  (services, manifestUrl, pageUrl): ServiceLinkSet[] =>
    services.map((entry) => serviceLinksFor(entry, manifestUrl, pageUrl)),
);

/**
 * A payload version as the reader should see it.
 *
 * Versions arrive from the aggregator however the service declared them — `v1` in one fleet, `1` or
 * `2026-01` in another. A hardcoded `v` prefix rendered `vv1` for the common case; conditionally
 * adding one would invent a convention for fleets that do not use it. So the string is shown as
 * declared, and only the empty string (a genuinely unversioned handler) gets a word.
 */
export const versionLabel = (version: string | null | undefined): string | null =>
  version == null || version === '' ? null : version;

/** The unversioned case said out loud, for surfaces that must show something. */
export const UNVERSIONED_LABEL = 'unversioned';

// ── Flows (the evidence plane) ──────────────────────────────────────────────────────────────────

import type { FleetTrace } from './slices/fleetSlice';

export const selectFailingFlowsOnly = (s: RootState) => s.view.failingFlowsOnly;
const selectTraces = (s: RootState) => s.fleet.traces;

export interface FlowView {
  /** False when no collector is wired: an empty list would otherwise read as "nothing happened". */
  available: boolean;
  flows: FleetTrace[];
  /** How many of the matching flows failed, before any failing-only filter narrowed the list. */
  failing: number;
  /** Total matching the entity, ignoring the failing-only filter — so the toggle can say what it hides. */
  total: number;
  /**
   * True when the plane returned no flows at all while reporting traffic.
   *
   * Flows are sampled and capped, and a counts-only poll asks for none deliberately, so an empty
   * list is never evidence that nothing happened — it has to be said rather than left to look
   * like silence.
   */
  sampledOut: boolean;
}

const newestFirst = (flows: FleetTrace[]) =>
  flows.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

function flowViewOf(traces: FleetTrace[], available: boolean, failingOnly: boolean, matching: FleetTrace[], sawTraffic: boolean): FlowView {
  const failing = matching.filter((f) => f.failed).length;
  return {
    available,
    flows: newestFirst(failingOnly ? matching.filter((f) => f.failed) : matching),
    failing,
    total: matching.length,
    sampledOut: traces.length === 0 && sawTraffic,
  };
}

const sawAnyTraffic = (s: RootState) =>
  s.fleet.topics.some((t) => !t.missingFeeds.includes('stats') && t.invocations > 0);

/** Every recent flow the plane returned. */
export const selectFlows = createSelector(
  [selectTraces, selectFleetAvailable, selectFailingFlowsOnly, sawAnyTraffic],
  (traces, available, failingOnly, sawTraffic): FlowView =>
    flowViewOf(traces, available, failingOnly, traces, sawTraffic),
);

/**
 * Flows whose entry topic is this one.
 *
 * `topic` is optional on the wire — a summary-plane row that mapped no Benzene spans cannot be
 * attributed — so an unattributed flow is simply not claimed for any topic rather than guessed at.
 */
export const selectFlowsForTopic = createSelector(
  [selectTraces, selectFleetAvailable, selectFailingFlowsOnly, sawAnyTraffic,
    (_: RootState, topic: string) => topic],
  (traces, available, failingOnly, sawTraffic, topic): FlowView =>
    flowViewOf(traces, available, failingOnly, traces.filter((f) => f.topic === topic), sawTraffic),
);

/** Flows this service took part in, at any point in the chain. */
export const selectFlowsForService = createSelector(
  [selectTraces, selectFleetAvailable, selectFailingFlowsOnly, sawAnyTraffic,
    (_: RootState, service: string) => service],
  (traces, available, failingOnly, sawTraffic, service): FlowView =>
    flowViewOf(traces, available, failingOnly, traces.filter((f) => f.services.includes(service)), sawTraffic),
);

// ── Service spec ────────────────────────────────────────────────────────────────────────────────

import type { ServiceSpecRequestsItem, ServiceSpecEventsItem, JsonSchema } from '../contracts';

export const selectSpecLoad = (s: RootState) => s.spec.load;
export const selectSpecError = (s: RootState) => s.spec.error;
export const selectSpec = (s: RootState) => s.spec.spec;
export const selectSpecShowUtility = (s: RootState) => s.spec.showUtility;
export const selectExpandedOperations = (s: RootState) => s.spec.expanded;

/** One operation on a service, request/response or event, in the shape the card renders. */
export interface SpecOperationModel {
  /** Stable within a document: topic plus version plus kind, so two versions do not collide. */
  id: string;
  kind: 'request' | 'event';
  topic: string;
  version: string | null;
  reserved: boolean;
  httpMappings: { method: string; path: string }[];
  /** Request/response for a request; message for an event. */
  input: JsonSchema | null;
  output: JsonSchema | null;
  example: unknown;
}

/** A schema's display name — its title, its array-of-title, or the shape word itself. */
export const schemaLabel = (schema: JsonSchema | null | undefined): string => {
  if (!schema) return '—';
  if (typeof schema.title === 'string') return schema.title;
  if (schema.type === 'array') {
    const items = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    const inner = items && typeof items.title === 'string' ? items.title : (items?.type ?? 'item');
    return `${String(inner)}[]`;
  }
  return typeof schema.type === 'string' ? schema.type : 'object';
};

const operationId = (kind: string, topic: string, version: string | null) =>
  `${kind}:${topic}${version ? `@${version}` : ''}`;

const requestOperation = (r: ServiceSpecRequestsItem): SpecOperationModel => ({
  id: operationId('request', r.topic, r.version || null),
  kind: 'request',
  topic: r.topic,
  version: r.version || null,
  reserved: r.reserved === true,
  httpMappings: r.httpMappings ?? [],
  input: r.request ?? null,
  output: r.response ?? null,
  example: r.example,
});

const eventOperation = (e: ServiceSpecEventsItem): SpecOperationModel => ({
  id: operationId('event', e.topic, e.version || null),
  kind: 'event',
  topic: e.topic,
  version: e.version || null,
  reserved: false,
  httpMappings: [],
  input: e.message ?? null,
  output: null,
  example: e.example,
});

/**
 * The service's domain operations — requests first, then events.
 *
 * Reserved topics are held back rather than mixed in. Every Benzene service carries the same
 * handful of utility topics, and a reader opening a spec is asking what *this* service does; the
 * utilities are the answer to a different question and are available on request.
 */
export const selectOperations = createSelector(
  [selectSpec, selectSpecShowUtility],
  (spec, showUtility): SpecOperationModel[] => {
    if (!spec) return [];
    // Defensive on purpose: `requests`/`events` are required by the contract, but a service on an
    // older Benzene — or anything else answering benzene:spec — can publish a document without
    // them, and a viewer that white-screens on an unfamiliar spec is worse than one that shows
    // what it can. Absent is rendered as "nothing exposed", which is what it means.
    const requests = (spec.requests ?? []).map(requestOperation);
    const events = (spec.events ?? []).map(eventOperation);
    const all = [...requests, ...events];
    return showUtility ? all : all.filter((op) => !op.reserved);
  },
);

/** The reserved operations, counted so their absence can be stated rather than hidden. */
export const selectUtilityOperations = createSelector([selectSpec], (spec): SpecOperationModel[] =>
  (spec?.requests ?? []).map(requestOperation).filter((op) => op.reserved),
);

export interface SpecSummaryModel {
  topics: number;
  httpMapped: number;
  events: number;
  schemas: number;
  utilities: number;
  transports: string[];
  /** Present when the service exposes a BenzeneMessage-over-HTTP endpoint — the send capability. */
  messageEndpoint: string | null;
}

/** The counts across the top. Derived, so the header and the sections cannot disagree. */
export const selectSpecSummary = createSelector([selectSpec], (spec): SpecSummaryModel | null => {
  if (!spec) return null;
  const domain = (spec.requests ?? []).filter((r) => r.reserved !== true);
  return {
    topics: domain.length,
    httpMapped: domain.filter((r) => (r.httpMappings ?? []).length > 0).length,
    events: (spec.events ?? []).length,
    schemas: Object.keys((spec.components?.schemas ?? {}) as Record<string, unknown>).length,
    utilities: (spec.requests ?? []).length - domain.length,
    transports: spec.transports ?? [],
    messageEndpoint: spec.messageEndpoint ?? null,
  };
});

/** Named schemas from the document's component bag, for the reference section. */
export const selectSpecSchemas = createSelector([selectSpec], (spec) =>
  Object.entries((spec?.components?.schemas ?? {}) as Record<string, JsonSchema>)
    .map(([name, schema]) => ({ name, schema }))
    .sort((a, b) => a.name.localeCompare(b.name)),
);

/**
 * Each service's RAG, keyed by name — for surfaces that draw services without holding the manifest.
 *
 * The topology graph is the case: it renders nodes from `topology.edges`, which carry no status, so
 * it drew every node in the accent colour. That made the graph — sitting on the front door — the one
 * surface where the estate's health was invisible.
 */
export const selectServiceRags = createSelector([selectServices], (services) => {
  const rags: Record<string, Rag> = {};
  for (const service of services) rags[service.name] = ragForStatus(service.status);
  return rags;
});

// ── The topics catalog ──────────────────────────────────────────────────────────────────────────

export const selectTopicFilter = (s: RootState) => s.view.topicFilter;
export const selectTopicSort = (s: RootState) => s.view.topicSort;
export const selectCollapsedSections = (s: RootState) => s.view.collapsedSections;
export const selectIsCollapsed = (s: RootState, section: string) =>
  s.view.collapsedSections.includes(section);

export interface CatalogRow {
  topic: string;
  version: string | null;
  reserved: boolean;
  producers: string[];
  consumers: string[];
  httpMappings: { method: string; path: string }[];
  status: string | null;
  schemaMismatch: boolean;
  /** Observed messages, or null when nothing is measuring — never conflated with zero. */
  traffic: number | null;
}

/**
 * Every topic in the estate, as one table.
 *
 * The guide calls the functional map the centrepiece, and it had no estate-level surface at all —
 * only "topics needing attention". A reader asking the product's first question, *what do these
 * services actually do*, had to open each service in turn and assemble the answer themselves.
 *
 * Traffic is `null` rather than `0` when no usage feed is wired, so the column can render "—" and a
 * reader sorting by it is not told that everything is unused.
 */
export const selectCatalogRows = createSelector(
  [selectTopics, selectUsageRaw, (s: RootState) => s.catalog.usage != null, selectShowUtility, selectTopicFilter],
  (topics, usageRows, feedWired, showUtility, filter): CatalogRow[] => {
    const entries = usageRows as UsageEntriesItem[];
    const needle = filter.trim().toLowerCase();

    return topics
      .filter((t) => showUtility || !t.reserved)
      .filter((t) => {
        if (!needle) return true;
        // Match the service names too: "who talks to payments-api" is the same question asked of
        // this table, and making the reader know the topic name first defeats the point.
        const haystack = [
          t.topic,
          ...(t.producers ?? []).map((p) => p.service),
          ...(t.consumers ?? []).map((c) => c.service),
        ].join(' ').toLowerCase();
        return haystack.includes(needle);
      })
      .map((t) => ({
        topic: t.topic,
        version: t.version || null,
        reserved: t.reserved,
        producers: (t.producers ?? []).map((p) => p.service),
        consumers: (t.consumers ?? []).map((c) => c.service),
        httpMappings: (t.consumers ?? []).flatMap((c) => c.httpMappings ?? []),
        status: t.status,
        schemaMismatch: t.schemaMismatch,
        traffic: feedWired
          ? entries.filter((e) => e.topic === t.topic).reduce((sum, e) => sum + e.count, 0)
          : null,
      }));
  },
);

/** How many topics the filter is hiding, so the reader knows the table is not the whole estate. */
export const selectCatalogTotal = createSelector(
  [selectTopics, selectShowUtility],
  (topics, showUtility) => topics.filter((t) => showUtility || !t.reserved).length,
);
