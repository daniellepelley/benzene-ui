import { describe, it, expect } from 'vitest';
import manifest from '../../contracts/artifacts/manifest.json';
import orders from '../../contracts/artifacts/services/orders-api.json';
import shipping from '../../contracts/artifacts/services/shipping-api.json';
import fleet from '../../contracts/artifacts/fleet.json';
import fleetMinimal from '../../contracts/artifacts/fleet.minimal.json';
import { isServiceStatus, SERVICE_STATUSES, type FleetView, type IssueClassification, type Manifest, type ServiceSnapshot } from './mesh';

const CLASSIFICATIONS: IssueClassification[] = [
  'exception', 'validation', 'config-wiring', 'dependency', 'contract-drift', 'unclassified',
];

/**
 * The double cast is a JSON-import artifact, not a contract gap. TypeScript types an imported
 * `statusCounts: { ok: 12 }` as that exact literal shape, and a union of two such literals is not
 * assignable to `Record<string, number>` — each member gains `?: undefined` for the other's keys.
 * The runtime value is a perfectly ordinary string-keyed map; only the import's inferred type is
 * narrower than the contract.
 */
const asFleetView = (sample: unknown) => sample as FleetView;

/**
 * The seam between generated structure and hand-declared meaning.
 *
 * Generation infers `status: string` from samples — it cannot invent a vocabulary. These tests are
 * what stops the two drifting: if the aggregator starts emitting a status the spec does not define,
 * or the samples are re-vendored with a changed shape, this fails rather than the UI rendering a
 * blank badge in production.
 */
describe('artifact contracts', () => {
  it('every status in the sample manifest is one the spec defines', () => {
    for (const service of (manifest as Manifest).services) {
      expect(isServiceStatus(service.status), `unknown status: ${service.status}`).toBe(true);
    }
  });

  it('the samples exercise more than one status, or they prove nothing', () => {
    // A sample set where everything is healthy would let a broken unhealthy path ship.
    const seen = new Set((manifest as Manifest).services.map((s) => s.status));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a snapshot may carry an error instead of a spec — both shapes must parse', () => {
    const ok = orders as ServiceSnapshot;
    const failed = shipping as ServiceSnapshot;

    expect(ok.name).toBe('orders-api');
    // shipping-api is the unreachable case: no spec, an error string instead.
    expect(failed.specJson).toBeNull();
    expect(failed.error).toContain('Connection refused');
  });

  it('every issue classification in the fleet sample is one the spec defines', () => {
    for (const issue of asFleetView(fleet).issues) {
      expect(CLASSIFICATIONS, `unknown classification: ${issue.classification}`).toContain(
        issue.classification,
      );
    }
  });

  it('the fleet contract keeps its three honesty channels', () => {
    // These are the fields a friendlier hand-written shape dropped, and the whole reason this slice
    // stores the wire contract rather than a convenience projection of it.
    const view = asFleetView(fleet);
    expect(view.services.some((s) => s.missingFeeds.length > 0)).toBe(true);
    expect(view.services.some((s) => s.lastSeen === undefined)).toBe(true);
    expect(view.window?.countsWindowed).toBe(false);
    expect(view.window?.countsSince).toBeTruthy();
  });

  it('a fleet view with no window and nothing observed still parses', () => {
    // The push-collector plane on a fresh estate: registered services, no health, no traces. The
    // reduced case has to be a first-class shape, not an afterthought.
    const view = asFleetView(fleetMinimal);
    expect(view.traces).toEqual([]);
    expect(view.window).toBeUndefined();
    expect(view.services[0]?.missingFeeds).toEqual(['health', 'traces']);
  });

  it('the status vocabulary has no duplicates and covers the RAG mapping', () => {
    expect(new Set(SERVICE_STATUSES).size).toBe(SERVICE_STATUSES.length);
    expect(SERVICE_STATUSES).toHaveLength(4);
  });
});
