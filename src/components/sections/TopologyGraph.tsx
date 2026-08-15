import { layoutTopology, NODE_H, type Layout } from './topologyLayout';
import { edgeLivenessFromField } from '../../contracts/mesh';
import type { Rag, TopologyEdgesItem } from '../../contracts';
import { EmptyState } from '../primitives/EmptyState';

export interface TopologyGraphProps {
  edges: TopologyEdgesItem[];
  onOpen?: (service: string) => void;
  /**
   * Each node's declared status, keyed by service name.
   *
   * The edges carry no status, so without this every node draws identically — which made the graph
   * the one surface on the front door where the estate's health was invisible. A node with no entry
   * is drawn dashed: it was observed calling something but is not in the manifest, which is a real
   * and interesting state, not a reason to guess green.
   *
   * A dashed *edge* means something different (mesh.md §4.2): a declared producer/consumer pair no
   * trace has ever exercised, drawn that way only when `TopologyEdgesItem.lastObservedAt` says so.
   */
  rags?: Record<string, Rag>;
  /** Above this, an edge is drawn as failing. */
  errorThreshold?: number;
}

/** Drawn from a precomputed layout — this component does no arithmetic beyond finding endpoints. */
export function TopologyGraph({ edges, onOpen, rags = {}, errorThreshold = 0.05 }: TopologyGraphProps) {
  const layout: Layout = layoutTopology(edges);

  if (layout.nodes.length === 0) {
    // mesh.md §4: the graph is declared (from `topics`/`consumes`), not derived from trace
    // parentage — an empty graph means no service has registered a cross-service edge yet, not
    // "nothing has been observed". A trace source being unwired never explains an empty graph.
    return <EmptyState message="No producer/consumer edges are declared yet — no registered service consumes another's topic." tone="unknown" />;
  }

  const at = (name: string) => layout.nodes.find((n) => n.name === name);

  return (
    <div className="bz-topo">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="Service topology graph"
      >
        <title>Service topology graph</title>
        <defs>
          {/* userSpaceOnUse keeps arrowheads a constant size instead of scaling with edge width. */}
          {['bz-arrow', 'bz-arrow-err'].map((id) => (
            <marker
              key={id}
              id={id}
              viewBox="0 0 10 10"
              refX={9}
              refY={5}
              markerWidth={9}
              markerHeight={9}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className={id === 'bz-arrow-err' ? 'bz-edge-err' : 'bz-edge-ok'} />
            </marker>
          ))}
        </defs>

        {layout.edges.map((e) => {
          const from = at(e.from);
          const to = at(e.to);
          if (!from || !to) return null;
          // A null error rate is "not reported", so it must not be drawn as failing.
          const failing = e.errorRate != null && e.errorRate > errorThreshold;
          // mesh.md §4.2: a declared edge the collector has never traced is a decommission
          // candidate, drawn dashed so it reads as distinct from a confirmed (declared *and*
          // observed) edge without inventing a fourth colour. Absent `lastObservedAt` (the
          // aggregator hasn't wired the signal) draws solid, exactly as before.
          const unobserved = edgeLivenessFromField(e.lastObservedAt) === 'unobserved';
          return (
            <line
              key={`${e.from}->${e.to}`}
              x1={from.x + from.w}
              y1={from.y + NODE_H / 2}
              x2={to.x}
              y2={to.y + NODE_H / 2}
              className={failing ? 'bz-edge-err' : 'bz-edge-ok'}
              // A structural edge (no observed traffic) draws at the minimum weight rather than NaN —
              // `undefined + 1` would poison the whole width calculation.
              strokeWidth={Math.max(1, Math.min(6, Math.log10((e.requestsPerMinute ?? 0) + 1) * 3))}
              strokeDasharray={unobserved ? '5 4' : undefined}
              markerEnd={`url(#${failing ? 'bz-arrow-err' : 'bz-arrow'})`}
            >
              {unobserved && <title>declared, never observed — a decommission candidate (mesh.md §4.2)</title>}
            </line>
          );
        })}

        {layout.nodes.map((n) => (
          <g key={n.name} className="bz-topo-node" data-rag={rags[n.name] ?? 'unknown'} onClick={() => onOpen?.(n.name)}>
            <rect x={n.x} y={n.y} width={n.w} height={NODE_H} rx={6} />
            <text x={n.x + n.w / 2} y={n.y + NODE_H / 2 + 4} textAnchor="middle">
              {n.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
