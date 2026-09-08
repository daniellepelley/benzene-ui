import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import {
  selectFeedErrors, selectFeedHealth, selectFleetAvailable, selectNeverHeartbeated,
  selectUndeclaredServices, selectLiveness, selectMissingFeedsForService, selectUsageForService,
  selectCapabilities, selectTopics, selectEdges, formatAge, selectNow,
} from './selectors';
import type { Liveness } from './selectors';
import type { ServiceStatus } from '../contracts';

/**
 * THE SETUP VIEW: what this mesh has wired, what it has not, and what is failing — in one place.
 *
 * The mesh is designed to work on a SUBSET of what it could know. A deployment with no collector
 * still has a catalog; a service that publishes a spec but no health endpoint is still a service;
 * an aggregator with no usage source still publishes topics. None of those is an error, and the UI
 * used to say otherwise on every screen: a red "usage could not be read" line on the estate, a
 * dashed "no usage feed is wired" box in every traffic card, an "environment not published" chip in
 * the chrome of every page, a "the collector reports no health feed" banner at the top of a service.
 * Individually honest; together, a product that looked broken whenever it was merely partial.
 *
 * So the honesty moves here and the pages go quiet. Every page still renders ONLY what it can
 * stand behind — an unwired feed is still never rendered as a zero — but the explanation of WHY a
 * section is missing lives on the Setup page, reached from a badge in the nav that counts only the
 * things that actually need a person: what is failing, and what is wired but degraded. "Not wired"
 * is listed, never counted; it is the ordinary state of a partial mesh, not a fault in it.
 *
 * Everything here is derived. Nothing in this file is stored, so it cannot drift from the slices
 * it summarises.
 */

export type SetupState =
  /** Wired and answering. */
  | 'ready'
  /** Not configured. Ordinary, not a fault — the mesh runs on the subset it has. Never counted. */
  | 'off'
  /** Wired and answering, but with a caveat the reader should know about. Counted. */
  | 'degraded'
  /** Wired and NOT answering, or the read failed. The only state that needs someone to fix something. Counted. */
  | 'failing'
  /** Not known yet — a fetch in flight, a first run that has not happened. Never counted. */
  | 'pending';

export interface SetupItem {
  id: 'catalog' | 'topics' | 'topology' | 'usage' | 'live' | 'dispatch' | 'refresh' | 'session' | 'environment';
  label: string;
  state: SetupState;
  /** One line on what the state means right now: the error, the age, "not wired". Reader-facing. */
  detail: string;
  /** What the UI can show once this is wired — the reason a reader would bother. */
  unlocks: string;
  /** How a host wires it. The ladder, made visible from the top. */
  howTo: string;
}

/** One service's participation: which of the feeds the mesh reads it is actually supplying. */
export interface ServiceSetupRow {
  name: string;
  status: ServiceStatus;
  /** True when the aggregator could reach it at all — an `unreachable` status means it could not. */
  reachable: boolean;
  /** Its observed liveness on the live plane, or null when there is no live plane to observe with. */
  live: Liveness | null;
  /** Feeds the collector declares it cannot supply for this service. */
  missingFeeds: string[];
  /** Whether the usage feed attributes any traffic to it. Null when no usage feed is wired. */
  usage: boolean | null;
  /** Whether the topic catalogue carries anything for it. Null when the topics feed is unreadable. */
  declares: boolean | null;
  /** What to do about the gaps, one clause each. Empty when there is nothing to do. */
  hints: string[];
}

export interface SetupView {
  items: SetupItem[];
  /** How many items are `failing` or `degraded` — the badge in the nav. Never counts `off`. */
  attention: number;
  /** The worst counted state, for the badge's colour. Null when nothing needs attention. */
  worst: 'failing' | 'degraded' | null;
  services: ServiceSetupRow[];
  /** Services the live plane reports that the manifest never catalogued. */
  undeclared: string[];
}

const NOT_FOUND = 404;

/**
 * A feed's setup state from its read outcome.
 *
 * A 404 is "this aggregator does not publish it" — a deployment that has not wired the source
 * behind it — and that is `off`, not `failing`: it is the ordinary shape of a partial mesh. Any
 * other failure is a feed that exists and is broken, which is the one case a person has to act on.
 */
function feedItem(
  id: SetupItem['id'], label: string, loaded: boolean, catalogLoad: string,
  error: { message: string; status: number | null } | undefined, readyDetail: string,
  unlocks: string, howTo: string,
): SetupItem {
  if (error) {
    return error.status === NOT_FOUND
      ? { id, label, state: 'off', detail: `not published by this aggregator (${error.message})`, unlocks, howTo }
      : { id, label, state: 'failing', detail: error.message, unlocks, howTo };
  }
  if (loaded) return { id, label, state: 'ready', detail: readyDetail, unlocks, howTo };
  return {
    id, label, state: 'pending',
    detail: catalogLoad === 'failed' ? 'the catalog could not be loaded' : 'not read yet',
    unlocks, howTo,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const selectSetupItems = createSelector(
  [
    (s: RootState) => s.estate.load,
    (s: RootState) => s.estate.error,
    (s: RootState) => s.estate.services.length,
    (s: RootState) => s.estate.generatedAtUtc,
    (s: RootState) => s.estate.refresh,
    (s: RootState) => s.estate.refreshNote,
    (s: RootState) => s.catalog.load,
    (s: RootState) => s.catalog.topics != null,
    (s: RootState) => s.catalog.topology != null,
    (s: RootState) => s.catalog.usage != null,
    (s: RootState) => s.catalog.usage?.entries.length ?? 0,
    selectTopics,
    selectEdges,
    selectFeedErrors,
    selectCapabilities,
    selectFeedHealth,
    selectFleetAvailable,
    selectNow,
  ],
  (
    estateLoad, estateError, serviceCount, generatedAtUtc, refresh, refreshNote, catalogLoad,
    hasTopics, hasTopology, hasUsage, usageRows, topics, edges, feedErrors, capabilities,
    feedHealth, fleetAvailable, now,
  ): SetupItem[] => {
    const error = (feed: string) => feedErrors.find((e) => e.feed === feed);

    const catalog: SetupItem = (() => {
      const base = {
        id: 'catalog' as const,
        label: 'Catalog',
        unlocks: 'Everything: the estate, each service, its status and contract.',
        howTo: 'Serve this page beside the aggregator’s artifacts, or point data-manifest-url (or ?url=) at manifest.json.',
      };
      if (estateLoad === 'ready') {
        const age = generatedAtUtc && now > 0 ? ` · published ${formatAge(now - Date.parse(generatedAtUtc))} ago` : '';
        return { ...base, state: 'ready', detail: `${plural(serviceCount, 'service')}${age}` };
      }
      if (estateLoad === 'empty') {
        return { ...base, state: 'pending', detail: 'no discovery pass has run yet, so nothing is published' };
      }
      if (estateLoad === 'failed') {
        return { ...base, state: 'failing', detail: estateError ?? 'the manifest could not be loaded' };
      }
      return { ...base, state: 'pending', detail: 'loading' };
    })();

    const items: SetupItem[] = [
      catalog,
      feedItem(
        'topics', 'Topics', hasTopics, catalogLoad, error('topics'),
        `${plural(topics.length, 'topic')} catalogued`,
        'The topic catalogue, what each service consumes and produces, and version comparisons.',
        'Published by Benzene.Mesh.Aggregator as topics.json beside manifest.json.',
      ),
      feedItem(
        'topology', 'Topology', hasTopology, catalogLoad, error('topology'),
        `${plural(edges.length, 'declared edge')}`,
        'Who calls whom, and the map on the estate page.',
        'Published by Benzene.Mesh.Aggregator as topology.json beside manifest.json.',
      ),
      feedItem(
        'usage', 'Usage feed', hasUsage, catalogLoad, error('usage'),
        `${plural(usageRows, 'usage row')}`,
        'Observed traffic per topic and service, and the evidence behind “unused” on the Retire page.',
        'Wire a usage source into the aggregator (Benzene.Mesh.Usage.CloudWatch or .ApplicationInsights) so it publishes usage.json.',
      ),
      (() => {
        const base = {
          id: 'live' as const,
          label: 'Live plane',
          unlocks: 'Heartbeats, issues, flows, the 24-hour inbox and “declared healthy but silent”.',
          howTo: 'Inject data-fleet-url pointing at a collector’s envelope endpoint — UseMeshUi(envelopeUrl:), or fleet.source in the mesh host’s config.',
        };
        if (!capabilities.fleet) return { ...base, state: 'off' as const, detail: 'not wired' };
        if (feedHealth == null) return { ...base, state: 'pending' as const, detail: 'no poll has completed yet' };
        if (feedHealth.kind === 'bad') return { ...base, state: 'failing' as const, detail: feedHealth.text };
        if (feedHealth.kind === 'warn') return { ...base, state: 'degraded' as const, detail: feedHealth.text };
        return { ...base, state: fleetAvailable ? 'ready' as const : 'pending' as const, detail: feedHealth.text };
      })(),
      {
        id: 'dispatch',
        label: 'Dispatch',
        state: capabilities.invoke ? 'ready' : 'off',
        detail: capabilities.invoke ? 'the Test Console can send' : 'not wired — the Test Console composes but cannot send',
        unlocks: 'Sending a composed message through a service’s real handler from the Test Console.',
        howTo: 'Wire Benzene.Mesh.Dispatch (UseMeshDispatchGuard + UseMeshDispatch behind an envelope) and inject data-dispatch-url. Off in Production unless allowInProduction is set.',
      },
      (() => {
        const base = {
          id: 'refresh' as const,
          label: 'Refresh',
          unlocks: 'A Refresh control that runs a discovery pass now instead of at the next scheduled one.',
          howTo: 'Mount Benzene.Mesh.Artifacts’ refresh route behind UseMeshRefreshGuard and inject data-refresh-url.',
        };
        if (!capabilities.refresh) return { ...base, state: 'off' as const, detail: 'not wired — the catalog changes on the mesh’s own schedule' };
        if (refresh === 'failed') return { ...base, state: 'failing' as const, detail: refreshNote ?? 'the last refresh could not be started' };
        if (refresh === 'expired') return { ...base, state: 'degraded' as const, detail: refreshNote ?? 'the session has expired' };
        return { ...base, state: 'ready' as const, detail: refresh === 'throttled' ? (refreshNote ?? 'refreshed recently') : 'on demand' };
      })(),
      {
        id: 'session',
        label: 'Sign-in',
        state: capabilities.logoutUrl ? 'ready' : 'off',
        detail: capabilities.logoutUrl ? 'behind a login gate; sign-out is available' : 'no login gate — this page is open',
        unlocks: 'A signed-in session with a Sign out control; roles that gate dispatch.',
        howTo: 'Put the page behind Benzene.Mesh.Auth.Oidc and inject data-logout-url.',
      },
      {
        id: 'environment',
        label: 'Environment label',
        state: capabilities.environment ? 'ready' : 'off',
        detail: capabilities.environment ?? 'not published — the chrome shows no environment',
        unlocks: 'Which estate this is (production, staging, …) in the chrome of every page.',
        howTo: 'Inject data-environment — UseMeshUi(environment:) — or set it in the mesh host’s config. Never inferred from a hostname.',
      },
    ];
    return items;
  },
);

const COUNTED: ReadonlySet<SetupState> = new Set(['failing', 'degraded']);

export const selectSetupAttention = createSelector([selectSetupItems], (items) => {
  const counted = items.filter((i) => COUNTED.has(i.state));
  const worst: SetupView['worst'] = counted.some((i) => i.state === 'failing')
    ? 'failing'
    : counted.length > 0 ? 'degraded' : null;
  return { attention: counted.length, worst };
});

/**
 * The per-service half: which feeds each service is actually supplying.
 *
 * This is the "works on a subset" story at the grain it happens: one service exposes a spec and no
 * health endpoint, another heartbeats and publishes nothing, a third is catalogued and has never
 * been seen. Each of those used to surface as a banner at the top of that service's page; here they
 * are one row each, beside every other service, so a reader sees the coverage rather than a fault.
 */
export const selectServiceSetup = createSelector(
  [
    (s: RootState) => s.estate.services,
    selectFleetAvailable,
    selectNeverHeartbeated,
    (s: RootState) => s,
  ],
  (services, live, neverHeartbeated, state): ServiceSetupRow[] => {
    const topicsReadable = state.catalog.topics != null;
    const usageWired = state.catalog.usage != null;
    return services.map((service) => {
      const reachable = service.status !== 'unreachable';
      const liveness = live ? selectLiveness(state, service.name) : null;
      const missingFeeds = selectMissingFeedsForService(state, service.name);
      const usage = usageWired ? selectUsageForService(state, service.name).entries.length > 0 : null;
      const declares = topicsReadable
        ? selectTopics(state).some((t) =>
          (t.consumers ?? []).some((c) => c.service === service.name)
          || (t.producers ?? []).some((p) => p.service === service.name))
        : null;

      const hints: string[] = [];
      if (!reachable) {
        hints.push('The aggregator could not reach it: check it serves its spec and health at the well-known paths the manifest links to.');
      }
      if (live && neverHeartbeated.includes(service.name)) {
        hints.push('Never reported to the collector: add mesh reporting to the service (WithCollector on its Cloud Service, or UseMeshSelfReport).');
      }
      if (missingFeeds.length > 0) {
        hints.push(`The collector declares no ${missingFeeds.join(', ')} feed${missingFeeds.length === 1 ? '' : 's'} for it, so those figures read as unknown rather than zero.`);
      }
      if (reachable && declares === false) {
        hints.push('Catalogued, but declares no topics: it is reachable and publishes an empty contract.');
      }
      return {
        name: service.name,
        status: service.status,
        reachable,
        live: liveness,
        missingFeeds,
        usage,
        declares,
        hints,
      };
    });
  },
);

export const selectSetup = createSelector(
  [selectSetupItems, selectSetupAttention, selectServiceSetup, selectUndeclaredServices],
  (items, { attention, worst }, services, undeclared): SetupView => ({
    items, attention, worst, services, undeclared,
  }),
);
