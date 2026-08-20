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
export const selectRefreshState = (s: RootState) => s.estate.refresh;
export const selectRefreshNote = (s: RootState) => s.estate.refreshNote;
/** Whether a Refresh control can do anything at all — see capabilitiesSlice. */
export const selectCanRefresh = (s: RootState) => s.capabilities.refresh;
/** Where signing out goes, or null when this deployment has no session to end. */
export const selectLogoutUrl = (s: RootState) => s.capabilities.logoutUrl;
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
/** The ticked wall clock. Exported because every `Stamp` needs it and no component may read one. */
export const selectNow = (s: RootState) => s.fleet.now;
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

/**
 * Feeds the collector has DECLARED it cannot supply for one service.
 *
 * `services[].missingFeeds` is the plane saying "I have no health data for this service" — and it
 * was read at topic grain and ignored at service grain, so a service whose collector declared
 * `["health","usage"]` rendered "Heartbeat healthy", "9.8k messages observed" and "● No issues
 * observed for this service". Three positive assertions built on feeds the collector had just said
 * it does not have, which is the third-state rule broken at the grain a reader scans first.
 */
export const selectMissingFeedsForService = createSelector(
  [selectFleetServices, selectFleetAvailable, (_: RootState, service: string) => service],
  (services, available, service): string[] =>
    (available ? services.find((s) => s.service === service)?.missingFeeds ?? [] : []),
);

/**
 * What the LIVE plane says about a service's health, which is a different question from what the
 * manifest declared and is answered by a fresher source.
 *
 * The field was on every fleet response and read by nothing: a service the collector reported as
 * `unreachable` rendered HEALTHY from a manifest snapshot hours older than the contradiction.
 *
 * PRECEDENCE, stated once: the live plane wins when it has an opinion, because it is the fresher
 * source and it is the one describing *now*. Where the two disagree the reader is told both, rather
 * than being handed a merged verdict with the disagreement hidden — a service declaring healthy
 * while the plane calls it unreachable is a finding, not a rendering conflict to resolve quietly.
 */
export const selectObservedHealth = createSelector(
  [selectFleetServices, selectFleetAvailable, (_: RootState, service: string) => service],
  (services, available, service): string | null => {
    if (!available) return null;
    const health = services.find((s) => s.service === service)?.health;
    return typeof health === 'string' && health !== '' ? health : null;
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
        // Never-reported is not a divergence — it is an unwired service, not a lying one. It is
        // reported separately, by `selectNeverHeartbeated`, because "I cannot see you at all" and
        // "you told me you were fine and then went quiet" are different problems with different
        // fixes, and the banner used to say "silent" while meaning this one.
        return lastSeen !== undefined && now - Date.parse(lastSeen) > HEARTBEAT_STALE_MS;
      })
      .map((s) => s.name);
  },
);

/**
 * Services in the manifest that have NEVER reported to the collector.
 *
 * The failure mode a platform engineer named as the one they most need to catch on a rollout — the
 * service is deployed and the mesh middleware was never wired — and it was visible only by opening
 * each service page one at a time, because the estate list carries no liveness at all. Two
 * never-heartbeated services rendered pixel-identical to one that reported thirty seconds ago.
 */
export const selectNeverHeartbeated = createSelector(
  [(s: RootState) => s.estate.services, selectFleetServices, selectFleetAvailable],
  (declared, observed, available) => {
    if (!available) return [];
    return declared
      .filter((s) => observed.find((o) => o.service === s.name)?.lastSeen === undefined)
      .map((s) => s.name);
  },
);

/**
 * Services the collector is reporting that the manifest does not contain.
 *
 * `mesh.md` §4.2's *undeclared* case at service grain: it is live, it is sending, and the aggregator
 * never fetched its spec. Dropped silently until now — which made it the third distinct cause of
 * "why isn't my service showing up" and the only one with no diagnosis anywhere in the product.
 */
export const selectUndeclaredServices = createSelector(
  [(s: RootState) => s.estate.services, selectFleetServices, selectFleetAvailable],
  (declared, observed, available) => {
    if (!available) return [];
    const known = new Set(declared.map((s) => s.name));
    return observed.filter((o) => !known.has(o.service)).map((o) => o.service);
  },
);

/**
 * How many instances of a service the collector has seen — or null when it cannot say.
 *
 * This is what withdraws a caveat. `POLLED_INSTANCE_CAVEAT` exists because the aggregator's spec
 * poll reaches whichever instance the load balancer chose, so during a rollout two runs can
 * legitimately disagree — and it turns every OWES/MOVED verdict on the product's best surface into a
 * maybe. A caveat added for honesty was blocking action on the output the whole rollout feature
 * exists to produce.
 *
 * On a service running one instance the hedge is simply false, and `instances` has been on the wire
 * the whole time, unread. Null (no plane, or no row for this service) keeps the caveat: unknown is
 * not one.
 */
export const selectInstanceCount = createSelector(
  [selectFleetServices, selectFleetAvailable, (_: RootState, service: string) => service],
  (observed, available, service): number | null => {
    if (!available) return null;
    const row = observed.find((o) => o.service === service);
    // Zero is "the collector has seen none", which is not a count of instances — it is the absence
    // of an observation, and hedging is right there.
    return row == null || row.instances <= 0 ? null : row.instances;
  },
);

/**
 * Services the collector has seen running more than one instance.
 *
 * The estate-wide form of the same withdrawal: on an estate where the plane accounts for every
 * declared service and each runs one instance, the poll cannot have reached a disagreeing instance,
 * so the caveat is withdrawn everywhere rather than merely per service. Null — not an empty list —
 * whenever the plane cannot account for the whole estate, because "I found none" and "I could not
 * look" must not render the same.
 */
export const selectMultiInstanceServices = createSelector(
  [(s: RootState) => s.estate.services, selectFleetServices, selectFleetAvailable],
  (declared, observed, available): string[] | null => {
    if (!available || declared.length === 0) return null;
    const rows = new Map(observed.map((o) => [o.service, o]));
    if (declared.some((d) => (rows.get(d.name)?.instances ?? 0) <= 0)) return null;
    return declared.filter((d) => (rows.get(d.name)!.instances) > 1).map((d) => d.name);
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

/**
 * The failure vocabulary this build knows, from `docs/specification/wire-contracts.md` §3.
 *
 * Kept explicitly so a status that is in NEITHER set can be recognised as unrecognised. The spec
 * permits a receiver with no `isSuccessful` signal to classify an application-defined status as a
 * failure — and the usage feed carries no such signal — but permission to assume the worst is not
 * permission to present the assumption as a measurement. A feed using an application-defined status
 * rendered as a confident "100.0% failed", which on a deploy-decision screen is the most damaging
 * possible reading of an unknown.
 */
const KNOWN_FAILURE_STATUSES = new Set([
  'validation-error', 'not-found', 'unauthorised', 'unauthorized', 'forbidden', 'conflict',
  'service-unavailable', 'exception', 'timeout', 'no-handler', 'bad-request',
]);

export const isSuccessStatus = (status: string | null | undefined) =>
  status != null && SUCCESS_STATUSES.has(status);

/** True when this build recognises the status at all — in either vocabulary. */
export const isKnownStatus = (status: string | null | undefined) =>
  status != null && (SUCCESS_STATUSES.has(status) || KNOWN_FAILURE_STATUSES.has(status));

export const selectCatalogLoad = (s: RootState) => s.catalog.load;

/**
 * The window the usage feed's counts actually cover, as dates.
 *
 * `windowStartUtc` / `windowEndUtc` are on every usage artifact and had never been read, so every
 * usage figure in the product was rendered under the phrase "over the usage feed's own window" —
 * true, unfalsifiable, and useless. A delivery owner reverse-engineered the period from a call rate
 * and concluded a headline "10.3k messages" was plausibly a two-hour figure they would have quoted
 * as a daily volume: "out by a factor of twelve."
 *
 * Null when the feed does not state its window, which stays honestly unstated rather than guessed.
 */
export const selectUsageWindow = createSelector(
  [(s: RootState) => s.catalog.usage],
  (usage): { from: string; to: string } | null => {
    const from = usage?.windowStartUtc;
    const to = usage?.windowEndUtc;
    return from && to ? { from, to } : null;
  },
);

/**
 * Artifacts the UI could not READ, with the reason — never merged with artifacts that were read and
 * were empty.
 *
 * The two look identical downstream once a failed fetch becomes `null`, and the product used to
 * collapse them: a 404 on `topics.json` rendered as "the aggregator has run but no service declared
 * one", which sends a reader to look for a registration problem across five services instead of a
 * 403 on one URL. It is the same defect as "absence rendered as good news", pointed at the reader's
 * own infrastructure.
 */
export const selectFeedErrors = createSelector(
  [(s: RootState) => s.catalog.feedErrors],
  (errors) => Object.entries(errors).map(([feed, message]) => ({ feed, message })),
);

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
  /**
   * True when the usage feed is wired at all — NOT "there are rows for this topic".
   *
   * Conflating the two made a wired feed with no rows for one topic render as "no usage source is
   * wired", so a reader debugged a healthy exporter while the Value page, using a different
   * definition of the same word, turned the identical absence into retirement evidence. One fact,
   * decided once.
   */
  observed: boolean;
  /** True when the feed is wired AND reported at least one row for this topic. */
  rowsForTopic: boolean;
  /**
   * Calls whose status this build does not recognise, counted into `failure` because the spec allows
   * no better guess — but reported separately so a surface can say the figure is a fallback rather
   * than a measurement.
   */
  unrecognised: number;
  /**
   * True when this figure covers EVERY version of the topic because the usage feed does not carry a
   * version, and the reader is looking at one version.
   *
   * This exists because the alternative is a lie. `usage.json` rows carry `version: null`, so joining
   * on topic name alone and printing the result under a `v2` heading tells a reader that v2 is
   * carrying traffic it may not be carrying at all — on a page that, two panels up, may be saying
   * nothing consumes v2. A number attributed to a version the feed cannot see is worse than a blank,
   * because a blank makes a reader go and look.
   */
  versionAttributed: boolean;
}

/**
 * Traffic for one topic, summed across services, transports and statuses.
 *
 * Attributes by version ONLY where the feed carries one. Where it does not, the total is still shown
 * — it is a real fact about the topic — but flagged so the surface can say which question it answers.
 */
export const selectTrafficForTopic = createSelector(
  [selectUsageRaw, (_: RootState, topic: string) => topic,
    (s: RootState, topic: string) => selectDisplayedVersion(s, topic),
    (s: RootState) => s.catalog.usage != null],
  (entries, topic, version, feedWired): TopicTraffic => {
    const all = (entries as UsageEntriesItem[]).filter((e) => e.topic === topic);
    // A feed that versions its rows can be trusted to attribute; one that does not, cannot.
    const feedHasVersions = all.some((e) => e.version != null && e.version !== '');
    const rows = feedHasVersions && version != null
      ? all.filter((e) => e.version === version)
      : all;

    let success = 0;
    let failure = 0;
    let unrecognised = 0;
    for (const row of rows) {
      if (isSuccessStatus(row.status)) success += row.count;
      else {
        failure += row.count;
        if (!isKnownStatus(row.status)) unrecognised += row.count;
      }
    }
    return {
      success,
      failure,
      unrecognised,
      total: success + failure,
      observed: feedWired,
      rowsForTopic: all.length > 0,
      versionAttributed: feedHasVersions,
    };
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

/**
 * The entry a topic page should show: the version the reader asked for, or the NEWEST published one.
 *
 * This used to be `topics.find(t => t.topic === topic)`, which returned the *lowest* version, because
 * the aggregator orders `ThenBy(Version)`. That single line hid every schema change in an estate: the
 * page rendered v1's payload under a v1 chip while the fleet ran v2, with no indication a v2 existed
 * — so a data map built from this page recorded fields that had already been deleted. Defaulting to
 * newest is the honest default; a reader who wants an older version can still ask for it by name.
 */
export const selectTopic = createSelector(
  [selectTopics, (_: RootState, topic: string) => topic, (s: RootState) => s.view.selectedVersion],
  (topics, topic, version) => {
    const entries = topics.filter((t) => t.topic === topic);
    if (entries.length === 0) return null;
    if (version != null) return entries.find((t) => t.version === version) ?? null;
    return entries[entries.length - 1]!;
  },
);

/**
 * The version the topic page is actually SHOWING — which is not the same as the version in the URL.
 *
 * `selectTopic` defaults to the newest entry when no version is pinned, so a bookmark or a typed URL
 * renders a page headed v2. Every traffic selector, meanwhile, keyed off `view.selectedVersion`,
 * which on that same arrival is null — so they merged every version and printed v1's numbers under
 * the v2 heading. On the round-6 estate that meant `order:placed` v2, which has carried zero
 * messages, rendered "observed 9.8k · errors 0" beneath its own v2 heading: a rollout that has not
 * started, reported as deployed and flowing cleanly. Clicking the v2 chip changed the answer on the
 * same page.
 *
 * Every in-product link pins the version, so the merge was only reachable by bookmark, typed URL,
 * pasted link or runbook step — which is exactly how an operator arrives on a release morning.
 */
export const selectDisplayedVersion = createSelector(
  [selectTopic],
  (entry) => entry?.version ?? null,
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

/**
 * The versions of a topic a reader can switch between, newest last, with the one on screen marked.
 * Empty when the topic has a single version — there is nothing to switch, and rendering a control
 * with one option implies a choice that does not exist.
 */
export const selectVersionSwitcher = createSelector(
  [selectTopicEntries, (s: RootState) => s.view.selectedVersion],
  (entries, selected) => {
    if (entries.length <= 1) return [];
    const current = selected ?? entries[entries.length - 1]?.version ?? null;
    return entries.map((entry) => ({ version: entry.version, current: entry.version === current }));
  },
);

/** The HTTP routes a topic's consumers expose it on — the only place the wire binding is visible. */
export const selectHttpMappingsForTopic = createSelector(
  [selectTopicEntries],
  (entries) => {
    // Deduped. A topic bound to one path at both v1 and v2 rendered the same route twice, which
    // reads as two distinct endpoints. Kept across versions rather than scoped to the one on screen:
    // the binding is how you reach the topic at all, and hiding it on a version whose consumer list
    // happens to be empty answers a question nobody asked.
    const seen = new Set<string>();
    return entries.flatMap((t) =>
      (t.consumers ?? []).flatMap((c) =>
        (c.httpMappings ?? [])
          .map((m) => ({ service: c.service, method: m.method, path: m.path }))
          .filter((m) => {
            const key = `${m.service} ${m.method} ${m.path}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })));
  },
);

// ── Version compatibility ───────────────────────────────────────────────────────────────────────

import type { TopicsVersionCompatibilityItem } from '../contracts';
import { buildRollouts } from './rollouts';

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

// ── Contract compatibility (cross-version) ──────────────────────────────────────────────────────

import type { TopicsTopicsItemCompatibility, TopicsTopicsItemCompatibilityChangesItem } from '../contracts';

/** The verdict classes, worst first. This order is the sort order everywhere changes are listed. */
export const VERDICT_ORDER = ['breaking', 'warning', 'compatible', 'notCompared'] as const;
export type Verdict = (typeof VERDICT_ORDER)[number];

/**
 * Whether this estate's aggregator publishes contract comparisons at all.
 *
 * A CAPABILITY CHECK ABOUT THE TOOL OUTRANKS A CONTENT CHECK ABOUT THE ESTATE. If no entry carries a
 * `compatibility` field, the answer to "what changed?" is "this aggregator does not say" — never "no
 * changes", and never a zero. Two of the three ports that build a catalogue do not compute this, so
 * this is a live case rather than a defensive one, and getting it wrong would put a false claim about
 * the reader's own architecture on screen.
 */
export const selectComparisonsPublished = createSelector([selectTopics], (topics) =>
  topics.some((t) => !t.reserved && t.compatibility != null),
);

/** The compatibility block for the entry a topic page is showing, or null. */
export const selectTopicCompatibility = createSelector(
  [selectTopic],
  (entry): TopicsTopicsItemCompatibility | null => entry?.compatibility ?? null,
);

/**
 * Every version pair in the estate as a rollout — who has moved, who owes a move, and what is
 * locked to what. See `rollouts.ts` for the model and for what it deliberately refuses to compute.
 */
export const selectRollouts = createSelector(
  [selectTopics, selectCompatibilityRaw],
  (topics, versionCompatibility) =>
    buildRollouts(topics, versionCompatibility as TopicsVersionCompatibilityItem[]),
);

/** Every outstanding obligation in the estate, flattened. */
export const selectObligations = createSelector([selectRollouts], (rollouts) =>
  rollouts.flatMap((r) => r.obligations));

/**
 * Outstanding moves grouped by the service that owes them — how many independent workstreams a
 * release actually is.
 *
 * Deliberately NOT the transitive coordination set. Closure over "must move together" collapses to
 * the whole estate the moment one service is a hub, which is why it is refused. This is the other
 * axis over the same data, and it does not degenerate: it is one row per service that owes
 * something, so a hub that has already moved simply has no row, and a hub that owes one move has a
 * row with a 1 in it. Bounded by the number of services, and it asserts no coupling that the
 * catalogue cannot see.
 *
 * A release manager and an architect asked for this from opposite directions in the same round —
 * "how many teams do I book" and "who is the bottleneck" — and both were assembling it by hand from
 * one service page at a time.
 */
export const selectOutstandingByService = createSelector([selectObligations], (obligations) => {
  const byService = new Map<string, typeof obligations>();
  for (const o of obligations) {
    const bucket = byService.get(o.service);
    if (bucket) bucket.push(o);
    else byService.set(o.service, [o]);
  }
  return [...byService.entries()]
    .map(([service, moves]) => ({
      service,
      moves,
      // A catch-up is a gap that exists now; a completion is a rollout merely unfinished. A service
      // carrying both is on the critical path twice, for two different reasons.
      catchUps: moves.filter((m) => m.kind === 'catchUp').length,
    }))
    .sort((a, b) => b.moves.length - a.moves.length || a.service.localeCompare(b.service));
});

/**
 * What this release requires of one service — the question a service owner's first click asks, and
 * the one the service page has never answered.
 *
 * Per service AND per topic, never rolled into one count. A service with two obligations on two
 * topics in two roles has two rows; collapsing them to "this service has work" is exactly how the
 * second one gets missed on a service somebody has already ticked off.
 */
export const selectObligationsForService = createSelector(
  [selectObligations, (_: RootState, service: string) => service],
  (obligations, service) => obligations.filter((o) => o.service === service),
);

/**
 * Rollouts where this service has done its part and somebody else has not.
 *
 * The other half of a service owner's question, and the half whose absence produced a false claim.
 * A service with no obligations rendered "nothing outstanding — every version this service declares
 * is covered on both sides", which answers "does this service owe a move?" while WORDED as "is this
 * service's contract surface healthy?". On the estate's one unhealthy service — which owes nothing
 * precisely because it moved first and moved correctly — that sentence sat above a version nothing
 * in the estate produces and a live 2,205-error issue card. Every fact needed to falsify it was on
 * the same screen.
 *
 * So the page states both sides: what this service owes, and what is owed to it.
 */
export const selectRolloutsAwaitedByService = createSelector(
  [selectRollouts, (_: RootState, service: string) => service],
  (rollouts, service) => rollouts.filter((r) =>
    r.outstanding.length > 0
    && !r.outstanding.includes(service)
    && r.moved.includes(service)),
);

/**
 * Whether any topic this service touches has more than one version.
 *
 * Separates "nothing outstanding" from "there is nothing here that could be outstanding". Both
 * render as an empty Outstanding block, and they lead to completely different actions.
 */
export const selectServiceHasVersionPairs = createSelector(
  [selectTopics, (_: RootState, service: string) => service],
  (topics, service) => {
    const mine = new Set(topics
      .filter((t) => !t.reserved
        && (t.producers?.some((p) => p.service === service) || t.consumers?.some((c) => c.service === service)))
      .map((t) => t.topic));
    const versions = new Map<string, number>();
    for (const t of topics) {
      if (t.reserved || !mine.has(t.topic)) continue;
      versions.set(t.topic, (versions.get(t.topic) ?? 0) + 1);
    }
    return [...versions.values()].some((n) => n > 1);
  },
);

export interface LedgerChange extends TopicsTopicsItemCompatibilityChangesItem {
  topic: string;
  version: string;
  baselineVersion: string | null;
  /** True when this change sits at or beneath a path where a type change stopped the walk. */
  truncated: boolean;
  /**
   * The services on each end of this topic.
   *
   * Attribution is by PARTICIPATION, not authorship: the catalogue records who is on each end of a
   * topic, not whose declaration moved. So this answers "who does this reach?" and NOT "who did
   * this?" — a distinction the copy that renders it has to keep, because a service credited with a
   * break it could not have caused is how the wrong team gets called.
   */
  services: string[];
  /**
   * Services declaring the CURRENT version — the ones that have already done the work.
   *
   * Rendered plainly and never with a severity badge. Doing the work is not a defect, and marking
   * the mover is how `shipping-api` came to look guilty for being the only service in the estate
   * that had already shipped.
   */
  moved: string[];
  /**
   * Services declaring the baseline and not the current version, in the role that has to move.
   *
   * This is the set the badge attaches to, the set the estate counts, and the set the ledger's
   * service filter is built from. Previously all of those were built from `services` — which is
   * drawn from the entry carrying the change, i.e. the version that already exists, i.e. whoever
   * has finished. `billing-api`, blocking a three-service chain, appeared on no changed entry and
   * was therefore absent from its own filter: asking the ledger about it returned the confident,
   * wrong answer that it had nothing to do.
   */
  outstanding: string[];
}

/**
 * The estate in one sentence — what state it is in, and what to look at first.
 *
 * The page's owned question is "what state is the estate in, and what should I look at first?"
 * (mesh-ui-aims.md §3), and until this existed nothing on it answered either half. A reader
 * assembled the answer from five KPI tiles, up to four banners and five equal-weight cards, of
 * which one asked anything of anybody — an arithmetic exercise where a verdict belonged.
 *
 * Clauses are ordered by what a reader must act on first, and a clause is OMITTED rather than
 * rendered as a zero: "0 unhealthy" is noise in the one place a verdict lives. An estate with
 * nothing wrong says so in as many words, which is a different sentence from an estate that could
 * not be assessed — `feedErrors` is deliberately not folded in here, because a feed that could not
 * be read is a fact about the plumbing and has its own line above.
 */
export const selectEstateVerdict = createSelector(
  [selectEstateSummary, selectRollouts, selectDivergences, selectNeverHeartbeated,
    selectUndeclaredServices, selectFleetAvailable],
  (summary, rollouts, stale, neverHeard, undeclared, live) => {
    const clauses: string[] = [];
    if (summary.counts.red > 0) clauses.push(`${summary.counts.red} unhealthy`);
    if (summary.counts.gone > 0) clauses.push(`${summary.counts.gone} unreachable`);
    if (summary.counts.amber > 0) clauses.push(`${summary.counts.amber} degraded`);

    const outstanding = rollouts.filter((r) => r.outstanding.length > 0).length;
    if (outstanding > 0) {
      clauses.push(`${outstanding} topic${outstanding === 1 ? '' : 's'} awaiting a contract move`);
    }

    // The divergence classes collapse into ONE clause here and stay separate in the block below.
    // The verdict answers "how much is wrong"; the block answers "which kind, and whose".
    const diverging = (live ? stale.length + neverHeard.length : 0) + undeclared.length;
    if (diverging > 0) {
      clauses.push(`declared and observed disagree in ${diverging} place${diverging === 1 ? '' : 's'}`);
    }

    return {
      /** null when there is nothing to report — the caller renders the all-clear, not an empty string. */
      clauses,
      services: summary.total,
      /**
       * Colours the sentence. NEVER green on a non-empty verdict: `summary.worst` only knows about
       * health, so an estate of perfectly healthy services with an outstanding breaking move scored
       * green while the sentence beside it listed the move — the reassuring colour winning over its
       * own words, which is the failure this sentence exists to prevent.
       */
      rag: clauses.length === 0
        ? ('green' as Rag)
        : (summary.worst && summary.worst !== 'green' ? summary.worst : ('amber' as Rag)),
    };
  },
);

/**
 * Every classified change in the estate, worst first — the data behind the changes ledger.
 *
 * Reserved topics are excluded for the same reason the aggregator excludes them from the diff: every
 * service carries the same utility topics and their churn is noise.
 */
export const selectAllChanges = createSelector([selectRollouts, selectTopics], (rollouts, topics): LedgerChange[] => {
  // Keyed on the pair, because who is outstanding is a property of BOTH entries — the current one
  // says who moved, the baseline one says who is left behind — and the change only carries the
  // current one.
  const byPair = new Map(rollouts.map((r) => [`${r.topic}@${r.version}`, r]));
  const rows: LedgerChange[] = [];
  for (const entry of topics) {
    const compatibility = entry.compatibility;
    if (entry.reserved || !compatibility) continue;
    const services = [...new Set([
      ...(entry.producers ?? []).map((p) => p.service),
      ...(entry.consumers ?? []).map((c) => c.service),
    ])].sort();
    const rollout = byPair.get(`${entry.topic}@${entry.version}`);
    for (const change of compatibility.changes) {
      rows.push({
        ...change,
        topic: entry.topic,
        version: entry.version,
        baselineVersion: compatibility.baselineVersion,
        truncated: compatibility.truncatedPaths.includes(change.path),
        services,
        moved: rollout?.moved ?? services,
        outstanding: rollout?.outstanding ?? [],
      });
    }
  }
  return rows.sort((a, b) =>
    VERDICT_ORDER.indexOf(a.compatibility as Verdict) - VERDICT_ORDER.indexOf(b.compatibility as Verdict)
    || a.topic.localeCompare(b.topic) || a.path.localeCompare(b.path));
});

/**
 * Topic versions the aggregator reported as changed but did not classify — an older .NET build, or a
 * port that detects change without a taxonomy.
 *
 * These are kept in their own group and are NEVER sorted into breaking/warning/compatible. Ranking
 * an unclassified change as if it were compatible is precisely the "absence rendered as good news"
 * defect, one level up.
 */
export const selectUnclassifiedChanges = createSelector([selectTopics], (topics) =>
  topics
    .filter((t) => !t.reserved)
    // A run-over-run change is unclassified when IT carries no field-level breakdown — a property of
    // the change, not of whether its topic happens to have a second version to compare against.
    // Gating on `!t.compatibility` dropped the drift on every multi-version topic from every
    // surface: the estate said the contract had moved, and the one page that lists changes showed
    // nothing, because the drift was filtered out on the way in.
    .flatMap((t) => (t.changes ?? [])
      .filter((c) => c.schemaChanges == null)
      .map((c) => ({ ...c, topic: t.topic, version: t.version }))),
);

/** One field-level change between the previous aggregator run and this one, ready to render. */
export interface DriftChange {
  topic: string;
  version: string;
  kind: string;
  direction: string;
  path: string;
  description: string;
  compatibility: string;
  /** The services on either end of the topic — participation, never authorship. */
  services: string[];
}

/**
 * Every classified drift in the estate, worst first — what moved *since the previous run*.
 *
 * A different question from `selectAllChanges`, and the two must not be merged. That one asks "does
 * v2 break a consumer still on v1?", comparing two versions inside one catalogue. This asks "did
 * this contract change since we last looked?", comparing one version against its own past. A topic
 * can be clean on one axis and alarming on the other — an in-place edit to an already-published
 * version has no version pair to compare, and is exactly what the run-over-run axis catches.
 *
 * This exists because drift was reported and never explained. The estate badged a service `drift`,
 * and following it led to `spec hash 5feaedb4… → b9b30797…` and, on the changes page, nothing at
 * all — a detection with no finding underneath it, which is where a reader gives up and starts
 * diffing spec documents by hand.
 */
export const selectDriftChanges = createSelector([selectTopics], (topics): DriftChange[] => {
  const rows: DriftChange[] = [];
  for (const entry of topics) {
    if (entry.reserved) continue;
    const services = [...new Set([
      ...(entry.producers ?? []).map((p) => p.service),
      ...(entry.consumers ?? []).map((c) => c.service),
    ])].sort();
    for (const change of entry.changes ?? []) {
      for (const field of change.schemaChanges ?? []) {
        rows.push({ ...field, topic: entry.topic, version: entry.version, services });
      }
    }
  }
  return rows.sort((a, b) =>
    VERDICT_ORDER.indexOf(a.compatibility as Verdict) - VERDICT_ORDER.indexOf(b.compatibility as Verdict)
    || a.topic.localeCompare(b.topic) || a.path.localeCompare(b.path));
});

/**
 * Whether this catalogue classifies drift at all — true once any run-over-run change carries a
 * field-level breakdown.
 *
 * Needed because "no drift" and "this aggregator does not classify drift" are different statements
 * and only one of them is good news. An older build, or a port that detects change without a
 * taxonomy, emits `changes` with no `schemaChanges`; rendering that as a quiet estate is the
 * absence-as-good-news defect.
 */
export const selectDriftClassified = createSelector([selectTopics], (topics) =>
  topics.some((t) => !t.reserved && (t.changes ?? []).some((c) => c.schemaChanges != null)),
);

/** Counts by verdict class, for the estate tile and the ledger head. */
export const selectChangeSummary = createSelector(
  [selectAllChanges, selectUnclassifiedChanges, selectComparisonsPublished, selectTopics],
  (changes, unclassified, published, topics) => {
    const counts: Record<string, number> = { breaking: 0, warning: 0, compatible: 0 };
    for (const change of changes) counts[change.compatibility] = (counts[change.compatibility] ?? 0) + 1;
    return {
      published,
      counts,
      unclassified: unclassified.length,
      /**
       * Field-level changes — deliberately the SAME unit the ledger's own header counts.
       *
       * The tile used to count changed topic-versions while the page one click away counted
       * individual changes, so a reader saw "6 contract changes" and then "10 changes" under one
       * label. The first question anyone asks a governance number is "6 of what?", and two answers a
       * click apart cost more credibility than the number was worth.
       */
      total: changes.length,
      /** Topic versions carrying at least one classified change — used where topics are the unit. */
      changedVersions: topics.filter((t) => !t.reserved && (t.compatibility?.changes.length ?? 0) > 0).length,
      notCompared: topics.filter((t) => !t.reserved && t.compatibility?.overall === 'notCompared').length,
    };
  },
);

/**
 * The contract changes belonging to one service — the topics it produces or consumes.
 *
 * Attribution is by PARTICIPATION, not authorship: the catalogue records who is on each end of a
 * topic, not whose declaration moved. A topic with two producers therefore attributes its change to
 * both. That is honest but coarse, and the alternative (per-provider attribution) needs a collector
 * change, so the copy that uses this must not imply it names a culprit.
 *
 * `outstanding` is the separate, sharper number: how many contract moves this service still owes.
 * It is deliberately NOT derived from the change counts, because a service can owe a deploy on a
 * `compatible` change and can owe nothing at all on a breaking one that has been versioned out.
 * Counting participation would have said `billing-api` had nothing to do while it blocked a
 * three-service chain.
 */
export const selectServiceChangeSummary = createSelector(
  [selectTopics, selectObligations, (_: RootState, service: string) => service],
  (topics, obligations, service) => {
    const mine = topics.filter((t) =>
      !t.reserved
      && (t.consumers?.some((c) => c.service === service) || t.producers?.some((p) => p.service === service))
      && (t.compatibility?.changes.length ?? 0) > 0);

    const all = mine.flatMap((t) => t.compatibility!.changes);
    return {
      topics: mine.length,
      changes: all.length,
      breaking: all.filter((c) => c.compatibility === 'breaking').length,
      warning: all.filter((c) => c.compatibility === 'warning').length,
      outstanding: obligations.filter((o) => o.service === service).length,
    };
  },
);

/**
 * What moved since the previous run, on the topics this service is on either end of — the
 * service-grain view of `selectDriftChanges`.
 *
 * Same participation-not-authorship caveat as above, and for a sharper reason here: run-over-run
 * drift on a topic with two producers cannot say which of them re-published. The copy must say
 * "reaches" and never "caused".
 */
export const selectServiceDriftSummary = createSelector(
  [selectDriftChanges, (_: RootState, service: string) => service],
  (drift, service) => {
    const mine = drift.filter((d) => d.services.includes(service));
    return {
      changes: mine.length,
      topics: new Set(mine.map((d) => `${d.topic}@${d.version}`)).size,
      breaking: mine.filter((d) => d.compatibility === 'breaking').length,
      warning: mine.filter((d) => d.compatibility === 'warning').length,
    };
  },
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

/**
 * A moment, rendered.
 *
 * THE DATE/AGE RULE: **a date is never rendered without its age, and an age is never rendered
 * without its date.** One helper, one test, every surface.
 *
 * Half the product printed raw UTC strings — `generated 2026-07-15T09:15:00Z` in the chrome,
 * `first seen … · last seen …` on the issue page — and left the reader to do the subtraction. A
 * 2.5-month-stale snapshot then rendered identically to a fresh one *while the page computed "4 of
 * 6 topics awaiting a move" from it*. The other half printed a bare age with nothing to anchor it,
 * which cannot be quoted into a document or compared against a deployment record.
 *
 * `mesh.md` §4.2 already mandates the discipline one grain down — *"a collector MUST report last
 * observed at (or its absence) per edge rather than collapsing it to a boolean, so a reader can
 * judge staleness for itself"* — and this is that sentence applied to the renders.
 *
 * Returns `null` for an absent or unparseable timestamp, so the caller renders the third state
 * rather than a plausible-looking epoch. The date is formatted from the ISO string in UTC, never
 * through the host locale: the artifacts are UTC, the collector is UTC, and a reader comparing the
 * screen against a log line must not have to guess which zone the screen is in.
 */
export interface StampText {
  /** `2026-07-15 09:15 UTC`. */
  date: string;
  /** `32d ago`, or null when no clock has ticked yet — an age nobody has measured, not a zero. */
  age: string | null;
  /** The original ISO string, for `dateTime`/`title` attributes. */
  iso: string;
  /** Date and age together, in the one order every surface uses. */
  text: string;
}

export const formatStamp = (iso: string | null | undefined, now: number): StampText | null => {
  if (iso == null || iso === '') return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;

  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    + ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;

  // `now === 0` is the store's "no clock has ticked" resting value, not midnight in 1970. It lasts
  // one frame in the app and for the whole of any test that does not tick, and in both cases the
  // honest answer is that the age is unmeasured — so the date renders alone rather than claiming an
  // age of 56 years.
  if (now <= 0) return { date, age: null, iso, text: date };

  const ageText = formatAge(now - at);
  const age = ageText === 'just now' ? 'just now' : `${ageText} ago`;
  return { date, age, iso, text: `${date} (${age})` };
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
    (s: RootState) => s.fleet.error,
  ],
  (available, lastOk, lastFail, lastActivity, now, declaredTopics, error): FeedHealth | null => {
    if (!available && lastOk == null && lastFail == null) return null; // no live plane wired

    if (lastOk == null) {
      /*
       * NAME WHAT ANSWERED, because "unreachable" is a diagnosis and it is usually the wrong one.
       *
       * A collector that answers `not-found` — because `data-fleet-url` points at a Benzene service
       * that never registered the mesh query handler — and a collector that answers a body this
       * build cannot parse are the two most common wiring mistakes a platform engineer will actually
       * make. Both used to render "unreachable", which sends them to security groups and DNS for an
       * hour when the fix is one line of handler registration.
       */
      if (lastFail == null) return null;
      // "Unreachable" was a DIAGNOSIS, and usually the wrong one — a collector answering `not-found`
      // is entirely reachable. What is always true is that no poll has succeeded; what is always
      // useful is the reason the last one didn't. So the sentence states the fact and quotes the
      // cause, and asserts nothing about the network.
      const attempt = `last attempt ${formatAge(now - lastFail)} ago`;
      return {
        kind: 'bad',
        text: error
          ? `live plane: no successful poll yet — ${error} (${attempt}); retrying`
          : `live plane unreachable — no successful poll yet (${attempt}); retrying`,
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
  /**
   * False when `usageTotal` is the WHOLE topic's traffic rather than this version's.
   *
   * The estate table already discloses this with a dagger; this page printed the same number bare,
   * so a version that has carried nothing showed the topic's total and read as live. Same product,
   * same fact, one screen honest and one not — and this is the screen a retirement decision is made
   * on, so it is the worse of the two places to be silent.
   */
  usageVersionAttributed: boolean;
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

    /*
     * Usage split by whether the message was HANDLED, because that is what "used" means here.
     *
     * The single total counted a failure as evidence of value, and `usageTotal > 0` short-circuited
     * to "no retirement signal — actively used". So `inventory:reserve v1` — one producer, zero
     * consumers, 2,205 messages of which 100% are `service-unavailable` — sat under a green heading
     * on the page named for the retirement decision, carrying the aggregator's own
     * `deprecation-candidate` flag in a chip beside it. A delivery owner: "if I had trusted the
     * Value page and skipped the drill-down, I would have told a steering group there is nothing to
     * retire in this estate. There is."
     *
     * A topic every message of which fails is the STRONGEST retirement signal in an estate, not the
     * weakest. `unrecognised` is kept apart from both for the standing reason: a status this build
     * does not know is not evidence of success or of failure.
     */
    const usageFor = (topic: string, version: string | null) => {
      const rows = entries.filter((e) =>
        e.topic === topic && (version == null || e.version == null || e.version === version));
      let succeeded = 0;
      let failed = 0;
      let unrecognised = 0;
      for (const row of rows) {
        if (isSuccessStatus(row.status)) succeeded += row.count;
        else {
          failed += row.count;
          if (!isKnownStatus(row.status)) unrecognised += row.count;
        }
      }
      return { succeeded, failed, unrecognised, total: succeeded + failed };
    };

    const removed = (removedRaw as RemovedTopicRow[]).filter((r) => showUtility || !isUtility(r.topic));

    const byTier: Record<RetirementTier, RetirementCandidate[]> = { candidate: [], verify: [], ok: [] };
    for (const entry of topics.filter((t) => !t.reserved)) {
      const usage = feedWired ? usageFor(entry.topic, entry.version || null) : null;
      const usageTotal = usage?.total ?? null;
      // What "used" means: messages that were handled. See `usageFor`.
      const usageSucceeded = usage?.succeeded ?? null;
      // Whether the feed can attribute by version at all for this topic. `totalFor` already falls
      // back to the whole topic when rows carry no version — this records that it did, so the row can
      // say so instead of presenting a topic total as a version's.
      const usageVersionAttributed = entries.some(
        (e) => e.topic === entry.topic && e.version != null && e.version !== '');
      const consumers = (entry.consumers ?? []).length;
      const evidence: string[] = [];
      let tier: RetirementTier;

      if (entry.status === 'gap') {
        tier = 'verify';
        evidence.push('produced outside this fleet (gap)');
        if (usageTotal === 0) evidence.push('no traffic observed');
      } else if (usageSucceeded != null && usageSucceeded > 0) {
        tier = 'ok';
        // Never contradict the chip beside you. A row carrying the aggregator's own
        // `deprecation-candidate` flag must not sit under "no retirement signal" unexamined.
        if (entry.status === 'deprecation-candidate') {
          tier = 'verify';
          evidence.push('the aggregator flagged this a deprecation candidate');
        }
        if (consumers === 0) {
          tier = 'verify';
          evidence.push('no declared consumers, but traffic is being handled — check who handles it');
        }
      } else if (usage != null && usage.failed > 0 && usage.succeeded === 0) {
        // The case that produced the finding: traffic exists and none of it is getting through.
        tier = 'candidate';
        evidence.push(`every observed message failed (${usage.failed.toLocaleString()})`);
        if (consumers === 0) evidence.push('no declared consumers');
        if (usage.unrecognised > 0) {
          evidence.push(`${usage.unrecognised.toLocaleString()} in statuses this build does not recognise`);
        }
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

      byTier[tier].push({ entry, usageTotal, usageVersionAttributed, evidence });
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

// ── Compose ─────────────────────────────────────────────────────────────────────────────────────

import { exampleFromSchema, inboundSchema } from './exampleFromSchema';
import { RAW_TRANSPORT } from './slices/composeSlice';

/**
 * Every distinct service that HANDLES a topic, across its versions — the set `ComposePage` dispatches
 * to when it is entered from a topic rather than a service.
 *
 * Consumers, not producers, and the distinction is the whole point: a dispatch INVOKES a topic on a
 * target service, so the target has to be the one with the handler. Resolving to the producer sent
 * every composed message to the service that emits the topic, which of course declares no handler
 * for it — so the in-product path from a working v1 topic returned a red `no-handler` naming the
 * wrong service. Last round the product manufactured false passes; this manufactured a false
 * failure, which is the same defect with the sign flipped and is worse, because a tester raises a
 * bug that does not exist.
 *
 * A topic can have more than one consumer, or none listed at all, so this is an answer to check
 * rather than one to assume — which is why the page asks when it is ambiguous.
 */
export const selectHandlerServicesForTopic = createSelector(
  [selectTopicEntries],
  (entries): string[] => {
    const services = new Set<string>();
    for (const t of entries) {
      for (const c of t.consumers ?? []) services.add(c.service);
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

/**
 * The live plane's own traffic figure for ONE SERVICE, beside the usage feed's.
 *
 * The Traffic card on a service page read `usage.json` and nothing else, so a service the collector
 * was actively watching could render "the usage feed observed nothing" with the live plane sitting
 * two selectors away reporting thousands of invocations over a different window. The topic page has
 * had both planes side by side since C1; the service page never got them.
 *
 * Two planes, two windows, never summed — the same tally rule the topic strip is built on.
 */
export interface ServiceLive {
  /** False when no collector is wired. Every field below is then meaningless, not zero. */
  available: boolean;
  /** null when the plane has no row for this service, or declares its counts absent. Not zero. */
  observed: number | null;
  /** null for the same reasons as `observed` — a stats-less plane has no error count either. */
  errors: number | null;
  /** What the plane says it could not supply for this service. */
  missingFeeds: string[];
  /** The window the reader picked, which the counts answer unless `countsSince` says otherwise. */
  rangeLabel: string;
  /** Set when the plane's counts cover a different period from the picked window. */
  countsSince: string | null;
}

export const selectLiveForService = createSelector(
  [selectFleetServices, selectFleetAvailable, selectRangeMs, (s: RootState) => s.fleet.window,
    (_: RootState, service: string) => service],
  (services, available, ms, window, service): ServiceLive => {
    const row = services.find((r) => r.service === service);
    const missingFeeds = row?.missingFeeds ?? [];
    // A plane that has declared it has no usage feed for this service is not reporting zero traffic
    // — it is declining to report, which is the third state and must not render as a measurement.
    const statsAbsent = missingFeeds.includes('usage') || missingFeeds.includes('stats');
    return {
      available,
      observed: row == null || statsAbsent ? null : row.invocations,
      errors: row == null || statsAbsent ? null : row.errors,
      missingFeeds,
      rangeLabel: rangeLabel(ms),
      countsSince: window && !window.countsWindowed ? (window.countsSince ?? null) : null,
    };
  },
);

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
  /**
   * Services REGISTERED to handle this topic, per the live plane's own declaration.
   *
   * Not services seen handling it. The plane carries no per-handler invocation count, so there is no
   * observation to report here — and calling it "observed handlers" put a registration under a
   * heading claiming measurement, printed directly beneath `observed 0`. If nothing was observed,
   * nothing was observed handling it.
   */
  registeredHandlers: string[];
  /**
   * When this topic last carried a message, per the collector — or null when it never has, or when
   * the plane does not report it.
   *
   * The collector stamps `topic.LastSeen` on every trace event and it was read nowhere. `observed 0`
   * over a 15-minute window says almost nothing on a topic that fires twice a day; "last carried
   * traffic 3d ago" answers the question the reader actually had, and is the sentence `mesh.md` §4.2
   * requires rather than a boolean.
   */
  lastSeen: string | null;
  /**
   * Services the collector has actually TRACED handling this topic — the genuine observation.
   *
   * Three facts, three feeds, and the product must never print one under another's label. `declared`
   * is what a service's spec endpoint said when it was polled; `registered` is what a running
   * instance told the collector; `observed` is traffic that crossed the edge. The whole question
   * "has the right thing been deployed?" lives in the gaps between them, so a surface that blurs
   * them is worse than one that omits them.
   *
   * Empty when no aggregator wired the signal at all, which is why `activityWired` exists beside it:
   * an unwired feed and a genuinely idle handler must not render the same.
   */
  observedHandlers: string[];
  /** Whether any aggregator published the per-edge activity signal for this topic. */
  activityWired: boolean;
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
    (_: RootState, topic: string) => topic,
    (s: RootState, topic: string) => selectDisplayedVersion(s, topic), selectTopics],
  (topics, available, ms, window, topic, version, catalogue): TopicLive => {
    // Scoped to the version on screen when the plane carries one. The collector DOES report per
    // version; merging the rows put the previous version's traffic under the new version's heading —
    // and named an observed handler on a version the same page had just said nobody consumes. That
    // is the fabricated-attribution defect the usage feed had, on a newer surface, with the correct
    // number sitting in the response and thrown away.
    const forTopic = topics.filter((t) => t.topic === topic);
    const planeHasVersions = forTopic.some((t) => t.version != null && t.version !== '');
    const rows = planeHasVersions && version != null
      ? forTopic.filter((t) => t.version === version)
      : forTopic;
    const missingFeeds = [...new Set(rows.flatMap((r) => r.missingFeeds))];
    const statsAbsent = missingFeeds.includes('stats');
    const durationAbsent = missingFeeds.includes('duration');

    // Weighted, so a busy version is not averaged away by a quiet one.
    const weighted = rows.reduce((n, r) => n + r.avgDurationMs * Math.max(r.invocations, 1), 0);
    const weights = rows.reduce((n, r) => n + Math.max(r.invocations, 1), 0);
    const observedTotal = rows.reduce((n, r) => n + r.invocations, 0);

    return {
      available,
      observed: rows.length === 0 || statsAbsent ? null : rows.reduce((n, r) => n + r.invocations, 0),
      errors: statsAbsent ? 0 : rows.reduce((n, r) => n + r.errors, 0),
      // `weights` uses `Math.max(invocations, 1)`, so a row with zero invocations still weighs 1 and
      // the guard never fired: a version that has carried nothing reported `avg ms 0.0`, which is a
      // measurement of nothing presented as a measurement. An em-dash, never a zero — the rule the
      // comment beside this already stated and the arithmetic quietly defeated.
      avgDurationMs: rows.length === 0 || durationAbsent || weights === 0 || observedTotal === 0
        ? null
        : weighted / weights,
      statusCounts: rows.reduce<Record<string, number>>((acc, r) => {
        for (const [status, count] of Object.entries(r.statusCounts)) {
          acc[status] = (acc[status] ?? 0) + count;
        }
        return acc;
      }, {}),
      // The plane's DECLARED consumer list for these rows — who is registered to handle the topic.
      // Not who was seen handling it: the plane carries no per-handler invocation count, so there is
      // no observation here to report. Naming it `services` and labelling it "observed handlers" put
      // a registration under a heading that claimed measurement, directly beneath `observed 0`.
      // The NEWEST across the rows in scope: the topic carried traffic if any version of it did.
      lastSeen: rows.reduce<string | null>((newest, r) => {
        if (r.lastSeen == null || r.lastSeen === '') return newest;
        return newest == null || Date.parse(r.lastSeen) > Date.parse(newest) ? r.lastSeen : newest;
      }, null),
      registeredHandlers: [...new Set(rows.flatMap((r) => r.consumers))].sort(),
      ...observedHandlersFor(catalogue, topic, version),
      missingFeeds,
      rangeLabel: rangeLabel(ms),
      countsSince: window && !window.countsWindowed ? (window.countsSince ?? null) : null,
    };
  },
);

/**
 * The genuinely observed half, read off the catalogue's per-edge activity rather than the live
 * plane's registration list.
 *
 * `consumerActivity` is keyed by service and carries `lastObservedAt`; absent field means no
 * aggregator wired the signal, `lastObservedAt: null` means declared and never traced. Those are
 * different facts and collapsing them is the same defect one level down.
 */
function observedHandlersFor(
  catalogue: TopicsTopicsItem[], topic: string, version: string | null,
): { observedHandlers: string[]; activityWired: boolean } {
  const entries = catalogue.filter((t) =>
    t.topic === topic && (version == null || t.version === version));
  const wired = entries.some((t) => t.consumerActivity !== undefined);
  if (!wired) return { observedHandlers: [], activityWired: false };
  const observed = new Set<string>();
  for (const entry of entries) {
    for (const [service, activity] of Object.entries(entry.consumerActivity ?? {})) {
      if (edgeLivenessOf(activity) === 'observed') observed.add(service);
    }
  }
  return { observedHandlers: [...observed].sort(), activityWired: true };
}

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
  /** False when `traffic` covers every version of the topic rather than this row's version. */
  trafficVersionAttributed: boolean;
  /** `breaking` / `warning` / `compatible`, or null when this row carries no classified change. */
  verdict: string | null;
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
        /**
         * False when the figure above is the whole topic's traffic repeated on each of its version
         * rows, because the usage feed carries no version.
         *
         * Without this the table silently double-counts: a topic at two versions printed its total
         * twice, so the column summed to roughly twice the estate's real traffic and a reader
         * comparing v1 against v2 saw two identical numbers and concluded the cutover was done.
         */
        trafficVersionAttributed:
          entries.some((e) => e.topic === t.topic && e.version != null && e.version !== ''),
        /** The cross-version verdict, so the STATUS column stops reading `ok` over a breaking change. */
        verdict: t.compatibility && t.compatibility.changes.length > 0 ? t.compatibility.overall : null,
      }));
  },
);

/** How many topics the filter is hiding, so the reader knows the table is not the whole estate. */
export const selectCatalogTotal = createSelector(
  [selectTopics, selectShowUtility],
  (topics, showUtility) => topics.filter((t) => showUtility || !t.reserved).length,
);

/**
 * The rollout for the exact version pair a topic page is showing.
 *
 * Version-aware because the panel it feeds sits beside a version switcher: showing v2's ordering
 * constraint while the reader is looking at v1's schema is the same class of defect as seeding a v1
 * body under a v2 label.
 */
export const selectRolloutForTopic = createSelector(
  [selectRollouts, selectTopic],
  (rollouts, entry) =>
    (entry
      ? rollouts.find((r) => r.topic === entry.topic && r.version === entry.version)
      : undefined) ?? null,
);
