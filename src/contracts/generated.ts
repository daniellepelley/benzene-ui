/**
 * GENERATED FILE — do not edit by hand. Run `npm run generate:contracts`.
 *
 * Inferred from the sample artifacts in `contracts/artifacts/`, vendored from the specification
 * repo at commit d7aed44057302707fb0a56158af5fed259c9908b.
 *
 * These types are a FLOOR, not a ceiling. The spec's conformance fixtures are test cases rather than
 * JSON Schema, so a field no sample exercises cannot be inferred, and a field that is null in every
 * sample infers as null-only. Widen by adding a sample, not by editing this file — otherwise the next
 * generation silently reverts it.
 *
 * Generated roots: Manifest, Topology, Usage, Topics, Annotations, FleetView, ServiceSpec, ServiceSnapshot
 */

/** The spec's schema bag, keyed by type name. Open, so it is declared, not inferred. */
export interface SpecComponents {
  schemas?: Record<string, JsonSchema>;
  [section: string]: unknown;
}

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

/**
 * mesh.md §4.2: per declared provider/consumer, whether — and when — a trace has actually
 * exercised the edge. Absent `lastObservedAt` (an empty object) is the honest "never observed"
 * case, a decommission *candidate*, not a fact; it is never collapsed to a boolean.
 */
export interface EdgeActivity {
  lastObservedAt?: string;
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
  requestsPerMinute?: number;
  errorRate?: number | null;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  p99LatencyMs?: number;
  lastObservedAt?: string | null;
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
  _comment?: string;
  generatedAtUtc: string;
  topics: TopicsTopicsItem[];
  removedTopics: TopicsRemovedTopicsItem[];
  versionCompatibility?: TopicsVersionCompatibilityItem[];
}

export interface TopicsTopicsItem {
  topic: string;
  version: string;
  reserved: boolean;
  consumers: TopicsTopicsItemConsumersItem[];
  producers: TopicsTopicsItemProducersItem[];
  status: string | null;
  schemaMismatch: boolean;
  changes?: TopicsTopicsItemChangesItem[];
  requestSchema?: JsonSchema | null;
  responseSchema?: JsonSchema | null;
  compatibility?: TopicsTopicsItemCompatibility | null;
  messageSchema?: JsonSchema | null;
  declaredSchemas?: TopicsTopicsItemDeclaredSchemasItem[];
  consumerActivity?: Record<string, EdgeActivity>;
  providerActivity?: Record<string, EdgeActivity>;
}

export interface TopicsTopicsItemConsumersItem {
  service: string;
  httpMappings?: TopicsTopicsItemConsumersItemHttpMappingsItem[];
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
  schemaChanges?: TopicsTopicsItemChangesItemSchemaChangesItem[];
  compatibility?: string;
}

export interface TopicsTopicsItemChangesItemSchemaChangesItem {
  kind: string;
  direction: string;
  path: string;
  description: string;
  compatibility: string;
}

export interface TopicsTopicsItemCompatibility {
  baselineVersion: string | null;
  overall: string;
  changes: TopicsTopicsItemCompatibilityChangesItem[];
  notComparedReason: string | null;
  truncatedPaths: string[];
  notComparedSides: string[];
}

export interface TopicsTopicsItemCompatibilityChangesItem {
  kind: string;
  direction: string;
  path: string;
  description: string;
  compatibility: string;
}

export interface TopicsTopicsItemDeclaredSchemasItem {
  service: string;
  role: string;
  requestSchema: JsonSchema;
  responseSchema: JsonSchema | null;
  messageSchema: JsonSchema | null;
}

export interface TopicsRemovedTopicsItem {
  topic: string;
  version: string;
}

export interface TopicsVersionCompatibilityItem {
  topic: string;
  producedVersions: string[];
  consumedVersions: string[];
  producedNotConsumed: string[];
  consumedNotProduced: string[];
  isCompatible: boolean;
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

export interface FleetView {
  generatedAt: string;
  services: FleetViewServicesItem[];
  topics: FleetViewTopicsItem[];
  traces: FleetViewTracesItem[];
  issues: FleetViewIssuesItem[];
  window?: FleetViewWindow;
}

export interface FleetViewServicesItem {
  service: string;
  runtime?: string;
  binding?: string;
  placement: Record<string, string>;
  topics: number;
  instances: number;
  health: string;
  lastSeen?: string;
  invocations: number;
  errors: number;
  missingFeeds: string[];
}

export interface FleetViewTopicsItem {
  topic: string;
  version?: string;
  providers: string[];
  consumers: string[];
  invocations: number;
  errors: number;
  avgDurationMs: number;
  statusCounts: Record<string, number>;
  lastSeen?: string;
  missingFeeds: string[];
}

export interface FleetViewTracesItem {
  traceId: string;
  events: number;
  services: string[];
  startedAt: string;
  durationMs: number;
  failed: boolean;
  topic?: string;
}

export interface FleetViewIssuesItem {
  fingerprint: string;
  classification: string;
  service: string;
  topic: string;
  version?: string;
  transport?: string;
  status: string;
  exceptionType?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  exemplarTraceIds: string[];
  resolutionHint?: string;
}

export interface FleetViewWindow {
  from: string;
  to: string;
  countsWindowed: boolean;
  countsSince?: string;
}

export interface ServiceSpec {
  openapi: string;
  info: ServiceSpecInfo;
  tags?: ServiceSpecTagsItem[];
  messageEndpoint?: string;
  transports?: string[];
  requests: ServiceSpecRequestsItem[];
  events: ServiceSpecEventsItem[];
  components: SpecComponents;
}

export interface ServiceSpecInfo {
  title: string;
  description?: string;
  version: string;
}

export interface ServiceSpecTagsItem {
  name: string;
  description: string;
}

export interface ServiceSpecRequestsItem {
  topic: string;
  version?: string;
  httpMappings?: ServiceSpecRequestsItemHttpMappingsItem[];
  request: JsonSchema;
  response: JsonSchema;
  example?: unknown;
  reserved?: boolean;
}

export interface ServiceSpecRequestsItemHttpMappingsItem {
  method: string;
  path: string;
}

export interface ServiceSpecEventsItem {
  topic: string;
  version?: string;
  message: JsonSchema;
  example?: unknown;
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
