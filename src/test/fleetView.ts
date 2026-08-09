import type { FleetView, MeshIssue } from '../contracts';
import type { FleetService, FleetTopic, FleetTrace } from '../store/slices/fleetSlice';

/**
 * Builders for the `FleetView` wire contract.
 *
 * Every required field is defaulted so a test states only what it is about — but the defaults are
 * the *honest* ones the contract calls for: no `lastSeen` (a plane with no live-time signal),
 * `health: 'unknown'`, and empty `missingFeeds`. A test that wants a healthy, recently-seen service
 * has to say so, which keeps the degraded cases from being an afterthought.
 */
export const fleetService = (over: Partial<FleetService> = {}): FleetService => ({
  service: 'orders-api',
  placement: {},
  topics: 1,
  instances: 1,
  health: 'unknown',
  invocations: 0,
  errors: 0,
  missingFeeds: [],
  ...over,
});

export const fleetTopic = (over: Partial<FleetTopic> = {}): FleetTopic => ({
  topic: 'orders:create',
  providers: ['orders-api'],
  consumers: [],
  invocations: 0,
  errors: 0,
  avgDurationMs: 0,
  statusCounts: {},
  missingFeeds: [],
  ...over,
});

export const fleetTrace = (over: Partial<FleetTrace> = {}): FleetTrace => ({
  traceId: 'trace-1',
  events: 3,
  services: ['orders-api'],
  startedAt: '2026-08-09T05:59:30Z',
  durationMs: 12,
  failed: false,
  ...over,
});

export const meshIssue = (over: Partial<MeshIssue> = {}): MeshIssue => ({
  fingerprint: 'f1',
  classification: 'exception',
  service: 'payments-api',
  topic: 'payment:capture',
  status: 'internal-server-error',
  count: 1,
  firstSeen: '2026-08-09T05:00:00Z',
  lastSeen: '2026-08-09T05:59:00Z',
  exemplarTraceIds: [],
  ...over,
});

export const fleetView = (over: Partial<FleetView> = {}): FleetView => ({
  generatedAt: '2026-08-09T06:00:00Z',
  services: [],
  topics: [],
  traces: [],
  issues: [],
  ...over,
});
