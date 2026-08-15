/**
 * The semantic layer over the generated artifact types.
 *
 * `generated.ts` is inferred from sample artifacts, so it gives *structure* — `status: string`, not
 * `'healthy' | 'degraded' | …`. Inference cannot produce a vocabulary from examples; that vocabulary
 * is a spec decision. So the generated file owns the shape, and this file owns the meaning, and the
 * two are pinned together by `contracts.test.ts`, which parses every vendored sample as these types.
 *
 * When the aggregator changes an artifact, re-vendor the samples and re-run the generator: the diff
 * on generated.ts is the contract change, and anything relying on the old shape stops compiling.
 */
import type {
  Manifest as GeneratedManifest,
  ManifestServicesItem,
  ServiceSnapshot as GeneratedServiceSnapshot,
  FleetView as GeneratedFleetView,
  FleetViewIssuesItem,
  EdgeActivity,
} from './generated';

export type * from './generated';

/** A service's declared health. The vocabulary is a spec decision, not an inferred one. */
export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unreachable';

/** Red/amber/green plus "gone" — the fleet's observed state, distinct from declared status. */
export type Rag = 'red' | 'amber' | 'green' | 'gone';

/** How a mesh issue is classified — mirrors MeshIssueClassification in the spec. */
export type IssueClassification =
  | 'exception'
  | 'validation'
  | 'config-wiring'
  | 'dependency'
  | 'contract-drift'
  | 'unclassified';

/** The generated shape, narrowed where the spec defines a vocabulary. */
export type ManifestService = Omit<ManifestServicesItem, 'status'> & { status: ServiceStatus };

export type Manifest = Omit<GeneratedManifest, 'services'> & { services: ManifestService[] };

/**
 * NOTE: the original mesh-ui.html computes snapshot age from `svc.snapshotAtUtc`, but
 * `MeshServiceSnapshot` in Benzene.Mesh.Contracts has no such member — it has `FetchedAtUtc`. The
 * old code was reading a field the contract never defined, so that age was always unknown. Typed as
 * optional here to record the discrepancy rather than silently perpetuate it; `fetchedAtUtc` is the
 * field to use, and it is non-nullable.
 */
export type ServiceSnapshot = GeneratedServiceSnapshot & {
  snapshotAtUtc?: string | null;
};

/**
 * One deduplicated, classified failure signature. The generated shape, narrowed where the spec
 * defines a vocabulary — `classification` is a closed set, which inference cannot know from samples.
 *
 * Identity is `fingerprint`, not an id: it is a hash over service|topic|version|classification|
 * discriminator, so the same failure keeps the same identity across collector restarts and across
 * instances. There is deliberately no `message` field — a message is prose that varies per
 * occurrence, and fingerprinting on it would shatter one issue into thousands.
 */
export type MeshIssue = Omit<FleetViewIssuesItem, 'classification'> & {
  classification: IssueClassification;
};

export type FleetView = Omit<GeneratedFleetView, 'issues'> & { issues: MeshIssue[] };

/** Every value `ServiceStatus` admits, for exhaustiveness checks and test data. */
export const SERVICE_STATUSES: readonly ServiceStatus[] = [
  'healthy',
  'degraded',
  'unhealthy',
  'unreachable',
] as const;

export const isServiceStatus = (value: string): value is ServiceStatus =>
  (SERVICE_STATUSES as readonly string[]).includes(value);

// ── Declared vs. observed (mesh.md §4.2) ────────────────────────────────────────────────────────
//
// The producer/consumer graph (mesh.md §4) is built from each service's registered
// `ServiceDescriptor.consumes`/`topics` alone — never from trace parentage. Traces still matter,
// but only as two additive, observed-only signals layered on top of that declared graph:
//
//   - "Unobserved" (liveness) — a declared edge with no matching trace in the retention window is
//     a decommission *candidate*, never a fact (trace export is lossy by design). Represented as
//     `TopicsTopicsItem.consumerActivity`/`.providerActivity` (keyed by service, mesh.md's
//     `query:topic` shape) and, on the topology graph, `TopologyEdgesItem.lastObservedAt`.
//   - "Undeclared" (drift) — a traced call nobody's registered descriptor declares is filed as an
//     ordinary `contract-drift` issue (already part of `IssueClassification` above), never rendered
//     as a graph edge — mesh.md §4.2 is explicit that neither signal is itself a topology edge.
//
// FORWARD-LOOKING: as of `contracts/SPEC_VERSION`, no port's aggregator projects
// `consumerActivity`/`providerActivity`/`lastObservedAt` into its published artifacts yet (the
// collector may compute the data — see benzene-python's `MeshCollector.query_topic` — without the
// aggregator forwarding it into `topics.json`/`topology.json`). The fields are optional for exactly
// this reason: `contracts/artifacts/topics.liveness.json` and `topology.liveness.json` are the only
// samples that carry them, so every selector and component below MUST degrade to today's
// confirmed-only rendering when they are absent, never fabricate a value.

/** mesh.md §4.2's tri-state for one declared edge, never collapsed to a boolean. */
export type EdgeLiveness = 'unknown' | 'unobserved' | 'observed';

/**
 * `unknown` — no aggregator has wired this signal (the field itself is absent): render exactly as
 * before, a confirmed-only graph. `unobserved` — declared, but the collector has never traced it: a
 * decommission candidate. `observed` — declared and traced; `activity.lastObservedAt` says when.
 */
export function edgeLivenessOf(activity: EdgeActivity | undefined): EdgeLiveness {
  if (activity === undefined) return 'unknown';
  return activity.lastObservedAt ? 'observed' : 'unobserved';
}

/** Same tri-state, for `TopologyEdgesItem.lastObservedAt`'s flatter `string | null` shape. */
export function edgeLivenessFromField(lastObservedAt: string | null | undefined): EdgeLiveness {
  if (lastObservedAt === undefined) return 'unknown';
  return lastObservedAt === null ? 'unobserved' : 'observed';
}
