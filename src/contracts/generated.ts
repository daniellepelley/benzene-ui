/**
 * GENERATED FILE — do not edit by hand. Run `npm run generate:contracts`.
 *
 * Inferred from the sample artifacts in `contracts/artifacts/`, vendored from the specification
 * repo at commit 7d5106c33edf356af0c3942ede7933c107898985.
 *
 * These types are a FLOOR, not a ceiling. The spec's conformance fixtures are test cases rather than
 * JSON Schema, so a field no sample exercises cannot be inferred, and a field that is null in every
 * sample infers as null-only. Widen by adding a sample, not by editing this file — otherwise the next
 * generation silently reverts it.
 *
 * Generated roots: Manifest, Topology, Usage, Topics, Annotations, ServiceSnapshot
 */

/** A JSON Schema document. Open and recursive by definition, so it is declared, not inferred. */
export interface JsonSchema {
  type?: string | string[];
  title?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [keyword: string]: unknown;
}

export interface Manifest {
  generatedAtUtc: string;
  services: ManifestServicesItem[];
}

export interface ManifestServicesItem {
  name: string;
  status: string;
  contractDrift: boolean;
  specUrl?: string;
  healthUrl?: string;
  owningTeam?: string;
}

export interface Topology {
  generatedAtUtc: string;
  edges: TopologyEdgesItem[];
}

export interface TopologyEdgesItem {
  client: string;
  server: string;
  source: string;
  requestsPerMinute: number;
  errorRate: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

export interface Usage {
  generatedAtUtc: string;
  windowStartUtc: string;
  windowEndUtc: string;
  entries: UsageEntriesItem[];
}

export interface UsageEntriesItem {
  topic: string;
  version: null;
  service: string | null;
  transport: string | null;
  status: string;
  count: number;
  avgDurationMs: number | null;
  source: string;
}

export interface Topics {
  generatedAtUtc: string;
  topics: TopicsTopicsItem[];
  removedTopics: TopicsRemovedTopicsItem[];
}

export interface TopicsTopicsItem {
  topic: string;
  version: string;
  reserved: boolean;
  consumers: TopicsTopicsItemConsumersItem[];
  producers: TopicsTopicsItemProducersItem[];
  status: string | null;
  requestSchema: JsonSchema | null;
  responseSchema: JsonSchema | null;
  messageSchema: JsonSchema | null;
  schemaMismatch: boolean;
  changes?: TopicsTopicsItemChangesItem[];
}

export interface TopicsTopicsItemConsumersItem {
  service: string;
  httpMappings: TopicsTopicsItemConsumersItemHttpMappingsItem[];
}

export interface TopicsTopicsItemConsumersItemHttpMappingsItem {
  method: string;
  path: string;
}

export interface TopicsTopicsItemProducersItem {
  service: string;
}

export interface TopicsTopicsItemChangesItem {
  kind: string;
  description: string;
}

export interface TopicsRemovedTopicsItem {
  topic: string;
  version: string;
}

export interface Annotations {
  generatedAtUtc: string;
  annotations: AnnotationsAnnotationsItem[];
}

export interface AnnotationsAnnotationsItem {
  id: string;
  entity: string;
  author: string;
  text: string;
  createdAtUtc: string;
}

export interface ServiceSnapshot {
  name: string;
  fetchedAtUtc: string;
  specJson: string | null;
  specHash: string | null;
  previousSpecHash: string | null;
  contractDrift: boolean;
  health: ServiceSnapshotHealth | null;
  error: string | null;
}

export interface ServiceSnapshotHealth {
  isHealthy: boolean;
  healthChecks: ServiceSnapshotHealthHealthChecks;
}

export interface ServiceSnapshotHealthHealthChecks {
  PostgresDatabase: ServiceSnapshotHealthHealthChecksPostgresDatabase;
  RedisCache?: ServiceSnapshotHealthHealthChecksRedisCache;
  SqsQueue?: ServiceSnapshotHealthHealthChecksSqsQueue;
  PaymentsGateway?: ServiceSnapshotHealthHealthChecksPaymentsGateway;
  FraudEngine?: ServiceSnapshotHealthHealthChecksFraudEngine;
}

export interface ServiceSnapshotHealthHealthChecksPostgresDatabase {
  status: string;
  type: string;
  data: ServiceSnapshotHealthHealthChecksPostgresDatabaseData;
  dependencies: ServiceSnapshotHealthHealthChecksPostgresDatabaseDependenciesItem[];
}

export interface ServiceSnapshotHealthHealthChecksPostgresDatabaseData {
  latencyMs: number;
  pool?: string;
}

export interface ServiceSnapshotHealthHealthChecksPostgresDatabaseDependenciesItem {
  kind: string;
  name: string;
}

export interface ServiceSnapshotHealthHealthChecksRedisCache {
  status: string;
  type: string;
  data: ServiceSnapshotHealthHealthChecksRedisCacheData;
  dependencies: ServiceSnapshotHealthHealthChecksRedisCacheDependenciesItem[];
}

export interface ServiceSnapshotHealthHealthChecksRedisCacheData {
  hitRate: string;
}

export interface ServiceSnapshotHealthHealthChecksRedisCacheDependenciesItem {
  kind: string;
  name: string;
}

export interface ServiceSnapshotHealthHealthChecksSqsQueue {
  status: string;
  type: string;
  data: ServiceSnapshotHealthHealthChecksSqsQueueData;
  dependencies: ServiceSnapshotHealthHealthChecksSqsQueueDependenciesItem[];
}

export interface ServiceSnapshotHealthHealthChecksSqsQueueData {
  approxDepth: number;
}

export interface ServiceSnapshotHealthHealthChecksSqsQueueDependenciesItem {
  kind: string;
  name: string;
}

export interface ServiceSnapshotHealthHealthChecksPaymentsGateway {
  status: string;
  type: string;
  data: ServiceSnapshotHealthHealthChecksPaymentsGatewayData;
  dependencies: ServiceSnapshotHealthHealthChecksPaymentsGatewayDependenciesItem[];
}

export interface ServiceSnapshotHealthHealthChecksPaymentsGatewayData {
  reason: string;
}

export interface ServiceSnapshotHealthHealthChecksPaymentsGatewayDependenciesItem {
  kind: string;
  name: string;
}

export interface ServiceSnapshotHealthHealthChecksFraudEngine {
  status: string;
  type: string;
  data: ServiceSnapshotHealthHealthChecksFraudEngineData;
  dependencies: ServiceSnapshotHealthHealthChecksFraudEngineDependenciesItem[];
}

export interface ServiceSnapshotHealthHealthChecksFraudEngineData {
  p99Ms: number;
  note: string;
}

export interface ServiceSnapshotHealthHealthChecksFraudEngineDependenciesItem {
  kind: string;
  name: string;
}
