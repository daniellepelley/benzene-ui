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

/** Every value `ServiceStatus` admits, for exhaustiveness checks and test data. */
export const SERVICE_STATUSES: readonly ServiceStatus[] = [
  'healthy',
  'degraded',
  'unhealthy',
  'unreachable',
] as const;

export const isServiceStatus = (value: string): value is ServiceStatus =>
  (SERVICE_STATUSES as readonly string[]).includes(value);
