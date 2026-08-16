import { edgeLivenessFromField } from '../../contracts/mesh';
import type { TopologyEdgesItem } from '../../contracts';
import { EmptyState } from '../primitives/EmptyState';
import { Chip } from '../primitives/Chip';
import { Stamp } from '../primitives/Stamp';

export interface EdgeListProps {
  edges: TopologyEdgesItem[];
  /** Which end of the edge to name — the other end is the service in context. */
  show: 'client' | 'server';
  emptyMessage: string;
  onOpen?: (service: string) => void;
  /** The ticked clock. `mesh.md` §4.2's "last observed at" is only useful with its age beside it. */
  now: number;
}

const rate = (v: number | null | undefined) =>
  v == null ? null : `${(v * 100).toFixed(1)}%`;

export function EdgeList({ edges, show, emptyMessage, onOpen, now }: EdgeListProps) {
  if (edges.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <ul className="bz-edge-list">
      {edges.map((e) => {
        const other = show === 'client' ? e.client : e.server;
        const errors = rate(e.errorRate);
        // A structural edge — derived from what services declare they produce/consume, with no trace
        // source wired — carries no traffic metrics. That is a real state (an estate with no Tempo/
        // Jaeger/X-Ray), not a zero: rendering `0/min` would invent an observation nobody made, and
        // reading `.toFixed` off the absent number is what white-screened the whole page. Show the
        // metrics when a source measured them; otherwise say, once, that this call is only declared.
        const measured = e.requestsPerMinute != null;
        // mesh.md §4.2: distinct from `measured` above, which asks whether a rate/latency source is
        // wired at all. `lastObservedAt` asks the narrower question — has *this* declared edge ever
        // been traced — and answers it even on an estate with no metrics source, so a structural edge
        // does not have to say the same thing for "no metrics wired" and "declared, never called".
        const liveness = edgeLivenessFromField(e.lastObservedAt);
        return (
          <li key={`${e.client}→${e.server}`}>
            <button type="button" className="bz-edge-peer" onClick={() => onOpen?.(other)}>
              {other}
            </button>
            {measured ? (
              <>
                <Chip title="Requests per minute">{e.requestsPerMinute!.toFixed(1)}/min</Chip>
                {/* A null error rate means the source did not report one — not zero errors. */}
                <Chip title={errors ? 'Error rate' : 'The trace source did not report an error rate'}>
                  {errors ?? 'errors unknown'}
                </Chip>
                {e.p95LatencyMs != null && <Chip title="p95 latency">p95 {e.p95LatencyMs}ms</Chip>}
              </>
            ) : liveness === 'unobserved' ? (
              <Chip
                tone="warn"
                title="Declared by the services' contracts; no trace has ever exercised this call — a decommission candidate, not a fact (mesh.md §4.2)"
              >
                declared — never observed
              </Chip>
            ) : liveness === 'observed' ? (
              <Chip title="Declared by the services' contracts, and traced at least once">
                declared — last observed{' '}
                <Stamp iso={e.lastObservedAt} now={now} absent="at an unstated time" />
              </Chip>
            ) : (
              <Chip title="Declared by the services' contracts; no trace source has observed this call">
                structural — no traffic observed
              </Chip>
            )}
          </li>
        );
      })}
    </ul>
  );
}
