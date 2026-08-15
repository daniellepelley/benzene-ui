import { describe, it, expect } from 'vitest';
import { computeLayers, layoutTopology, nodeWidth, PAD, NODE_H, ROW_GAP } from './topologyLayout';
import type { TopologyEdgesItem } from '../../contracts';

const edge = (client: string, server: string, over: Partial<TopologyEdgesItem> = {}) =>
  ({
    client,
    server,
    source: 'tempo',
    requestsPerMinute: 10,
    errorRate: 0,
    p50LatencyMs: 1,
    p95LatencyMs: 2,
    p99LatencyMs: 3,
    ...over,
  }) as TopologyEdgesItem;

describe('computeLayers', () => {
  it('puts each service one layer after its caller', () => {
    const layers = computeLayers(['a', 'b', 'c'], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    expect(layers).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('terminates on a cycle instead of looping forever', () => {
    // A real estate contains cycles. Without the guard this is an infinite relaxation.
    const layers = computeLayers(['a', 'b'], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ]);
    expect(Object.keys(layers)).toHaveLength(2);
    for (const v of Object.values(layers)) expect(v).toBeLessThanOrEqual(2);
  });

  it('takes the longest path, so a node sits after ALL its callers', () => {
    // a→c directly and a→b→c: c must land at 2, not 1, or the edge from b would point backwards.
    const layers = computeLayers(['a', 'b', 'c'], [
      { from: 'a', to: 'c' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    expect(layers.c).toBe(2);
  });
});

describe('layoutTopology', () => {
  it('is empty for no edges, rather than a zero-size canvas', () => {
    expect(layoutTopology([])).toEqual({ nodes: [], edges: [], width: 0, height: 0 });
  });

  it('places callers left of callees', () => {
    const { nodes } = layoutTopology([edge('orders-api', 'payments-api')]);
    const orders = nodes.find((n) => n.name === 'orders-api')!;
    const payments = nodes.find((n) => n.name === 'payments-api')!;
    expect(orders.x).toBeLessThan(payments.x);
  });

  it('stacks same-layer services by row, alphabetically', () => {
    const { nodes } = layoutTopology([edge('zeta', 'target'), edge('alpha', 'target')]);
    const alpha = nodes.find((n) => n.name === 'alpha')!;
    const zeta = nodes.find((n) => n.name === 'zeta')!;
    expect(alpha.x).toBe(zeta.x);
    expect(alpha.y).toBe(PAD);
    expect(zeta.y).toBe(PAD + (NODE_H + ROW_GAP));
  });

  it('caps node width so one long service name cannot blow out a column', () => {
    expect(nodeWidth('a')).toBeLessThan(nodeWidth('a-much-longer-name'));
    expect(nodeWidth('x'.repeat(500))).toBe(230);
  });

  it('carries a missing error rate through as null, not zero', () => {
    // Drawing "not reported" as 0% would paint an unmeasured edge as perfectly healthy.
    const { edges } = layoutTopology([edge('a', 'b', { errorRate: null })]);
    expect(edges[0]?.errorRate).toBeNull();
  });

  // mesh.md §4.2: `lastObservedAt` is a tri-state (absent / null / a timestamp), unlike errorRate
  // and requestsPerMinute above which collapse "not reported" to null. The layout must preserve all
  // three rather than flattening "the aggregator hasn't wired this" into "declared, never observed".
  it('carries lastObservedAt through undefined when the aggregator has not wired liveness', () => {
    const { edges } = layoutTopology([edge('a', 'b')]);
    expect(edges[0]?.lastObservedAt).toBeUndefined();
  });

  it('carries lastObservedAt through null for a declared edge nothing has ever traced', () => {
    const { edges } = layoutTopology([edge('a', 'b', { lastObservedAt: null })]);
    expect(edges[0]?.lastObservedAt).toBeNull();
  });

  it('carries lastObservedAt through as a timestamp for a traced edge', () => {
    const { edges } = layoutTopology([edge('a', 'b', { lastObservedAt: '2026-08-15T08:50:00Z' })]);
    expect(edges[0]?.lastObservedAt).toBe('2026-08-15T08:50:00Z');
  });

  it('sizes the canvas to fit every node', () => {
    const layout = layoutTopology([edge('a', 'b'), edge('a', 'c')]);
    for (const n of layout.nodes) {
      expect(n.x + n.w).toBeLessThanOrEqual(layout.width);
      expect(n.y + NODE_H).toBeLessThanOrEqual(layout.height);
    }
  });
});
