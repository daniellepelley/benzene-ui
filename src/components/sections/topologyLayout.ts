import type { TopologyEdgesItem } from '../../contracts';

/**
 * Graph layout, ported from mesh-ui.html's `computeLayers` / `renderTopologyGraph` unchanged.
 *
 * Kept as a pure function of edges → geometry, separate from the SVG that draws it. In the original
 * this was interleaved with `document.createElementNS` calls, so the arithmetic could only be checked
 * by looking at the picture. Here the arithmetic is the unit under test and the component is a dumb
 * renderer — which is the whole argument for the port, applied to the one genuinely algorithmic part.
 *
 * Deliberately NOT redesigned. Same longest-path layering, same cycle guard, same constants.
 */

export const NODE_H = 30;
export const ROW_GAP = 26;
export const COL_GAP = 110;
export const PAD = 22;

export const nodeWidth = (name: string) => Math.min(230, 22 + name.length * 7.4);

export interface Node {
  name: string;
  x: number;
  y: number;
  w: number;
}

export interface Edge {
  from: string;
  to: string;
  /** null when the trace source reported no error rate — not the same as zero. */
  errorRate: number | null;
  /** null on a structural edge — declared by contract, never observed by a trace source. */
  requestsPerMinute: number | null;
  /**
   * mesh.md §4.2's liveness signal, distinct from `requestsPerMinute`: whether *this* declared edge
   * has ever been traced, independent of whether a rate/latency source is wired at all.
   * `undefined` — the aggregator hasn't projected the signal; render exactly as before.
   * `null` — declared, but never traced: a decommission candidate.
   * a string — declared and traced; the last-observed timestamp.
   */
  lastObservedAt?: string | null;
}

export interface Layout {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
}

/**
 * Longest-path layering with a cycle guard: relax layer assignments at most N times, so a cyclic
 * call graph (A→B→A) settles instead of looping forever. A real estate will contain cycles.
 */
export function computeLayers(names: string[], links: { from: string; to: string }[]) {
  const layer: Record<string, number> = {};
  for (const n of names) layer[n] = 0;

  for (let pass = 0; pass < names.length + 1; pass++) {
    let changed = false;
    for (const link of links) {
      const from = layer[link.from] ?? 0;
      const to = layer[link.to] ?? 0;
      if (to < from + 1 && from + 1 <= names.length) {
        layer[link.to] = from + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return layer;
}

export function layoutTopology(edges: TopologyEdgesItem[]): Layout {
  const names: string[] = [];
  for (const e of edges) {
    if (!names.includes(e.client)) names.push(e.client);
    if (!names.includes(e.server)) names.push(e.server);
  }
  if (names.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const layerOf = computeLayers(
    names,
    edges.map((e) => ({ from: e.client, to: e.server })),
  );

  const columns = new Map<number, string[]>();
  for (const name of [...names].sort()) {
    const layer = layerOf[name] ?? 0;
    if (!columns.has(layer)) columns.set(layer, []);
    columns.get(layer)!.push(name);
  }

  let maxRows = 0;
  const colWidth = new Map<number, number>();
  for (const [layer, members] of columns) {
    colWidth.set(layer, Math.max(...members.map(nodeWidth)));
    maxRows = Math.max(maxRows, members.length);
  }

  const nodes: Node[] = [];
  let x = PAD;
  for (const layer of [...columns.keys()].sort((a, b) => a - b)) {
    const members = columns.get(layer)!;
    members.forEach((name, i) => {
      nodes.push({ name, x, y: PAD + i * (NODE_H + ROW_GAP), w: nodeWidth(name) });
    });
    x += (colWidth.get(layer) ?? 0) + COL_GAP;
  }

  return {
    nodes,
    edges: edges.map((e) => ({
      from: e.client,
      to: e.server,
      errorRate: e.errorRate ?? null,
      requestsPerMinute: e.requestsPerMinute ?? null,
      lastObservedAt: e.lastObservedAt,
    })),
    width: x - COL_GAP + PAD,
    height: PAD * 2 + maxRows * (NODE_H + ROW_GAP) - ROW_GAP,
  };
}
