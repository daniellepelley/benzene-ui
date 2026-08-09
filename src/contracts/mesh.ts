/**
 * Mesh contract types.
 *
 * These mirror `docs/specification/mesh.md` in the specification repo, and the vendored conformance
 * fixtures in `contracts/` are pinned to the spec commit recorded in `contracts/SPEC_VERSION`.
 * A drift check compares that pin against the spec repo, so a contract change becomes a build
 * failure here rather than an `undefined` at runtime — the same mechanism every language port uses.
 */

/** A service's declared health, as published in the manifest. */
export type ServiceStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unreachable';

/** Red/amber/green plus "gone" — the fleet's observed state, distinct from declared status. */
export type Rag = 'red' | 'amber' | 'green' | 'gone';

/** One service as it appears in the estate manifest. */
export interface ManifestService {
  name: string;
  status: ServiceStatus;
  contractDrift: boolean;
  specUrl?: string | null;
  healthUrl?: string | null;
  owningTeam?: string | null;
}

/** The estate manifest — the declared plane. */
export interface Manifest {
  generatedAtUtc: string;
  services: ManifestService[];
}

/** A service's published artifact — the detail behind a manifest entry. */
export interface ServiceSnapshot {
  name: string;
  fetchedAtUtc: string | null;
  snapshotAtUtc?: string | null;
  specJson: string | null;
  specHash: string | null;
  previousSpecHash: string | null;
  contractDrift: boolean;
  health: HealthReport | null;
  error: string | null;
}

export interface HealthReport {
  status: ServiceStatus;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  healthy: boolean;
  message?: string | null;
}

/** How a mesh issue is classified — mirrors MeshIssueClassification. */
export type IssueClassification =
  | 'exception'
  | 'validation'
  | 'config-wiring'
  | 'dependency'
  | 'contract-drift'
  | 'unclassified';

export interface MeshIssue {
  id: string;
  service: string;
  topic?: string | null;
  classification: IssueClassification;
  message: string;
  observedAtUtc: string;
  count?: number;
}
