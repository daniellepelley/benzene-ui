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

import { HEARTBEAT_STALE_MS, type FleetIssue, type FleetService } from './slices/fleetSlice';

export const selectFleetAvailable = (s: RootState) => s.fleet.available;
export const selectFleetLoad = (s: RootState) => s.fleet.load;
const selectFleetServices = (s: RootState) => s.fleet.services;
const selectFleetTopics = (s: RootState) => s.fleet.topics;
const selectNow = (s: RootState) => s.fleet.now;
const selectIssues = (s: RootState) => s.fleet.issues;

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
const NONE: readonly never[] = Object.freeze([]);

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
      canSend: bodyValid && headersValid && compose.send !== 'sending' && compose.topic != null,
    };
  },
);

// ── Capabilities ────────────────────────────────────────────────────────────────────────────────

export const selectCapabilities = (s: RootState) => s.capabilities;
export const selectCanInvoke = (s: RootState) => s.capabilities.invoke;
export const selectCanAnnotate = (s: RootState) => s.capabilities.annotate;

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
