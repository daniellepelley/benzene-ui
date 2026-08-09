import { describe, it, expect } from 'vitest';
import manifest from '../../contracts/artifacts/manifest.json';
import orders from '../../contracts/artifacts/services/orders-api.json';
import shipping from '../../contracts/artifacts/services/shipping-api.json';
import { isServiceStatus, SERVICE_STATUSES, type Manifest, type ServiceSnapshot } from './mesh';

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

  it('the status vocabulary has no duplicates and covers the RAG mapping', () => {
    expect(new Set(SERVICE_STATUSES).size).toBe(SERVICE_STATUSES.length);
    expect(SERVICE_STATUSES).toHaveLength(4);
  });
});
