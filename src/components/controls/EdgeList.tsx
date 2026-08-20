import { edgeLivenessFromField } from '../../contracts/mesh';
import type { TopologyEdgesItem } from '../../contracts';
import { EmptyState } from '../primitives/EmptyState';
import { Chip } from '../primitives/Chip';
import { Alarm, Absent, Provenance } from '../primitives/Qualifier';
import { Stamp } from '../primitives/Stamp';
import { Keyline } from '../primitives/Keyline';

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

  const anyMeasured = edges.some((e) => e.requestsPerMinute != null);

  return (
    <>
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
                <Chip>{e.requestsPerMinute!.toFixed(1)}/min</Chip>
                {/* THE NOUN AND THE SOURCE, because a bare `100.0%` nearly went into a Sev1
                    justification as "100% of orders→shipping is down". It is the share of calls on
                    THIS EDGE that the TRACE SOURCE saw fail — a different measurement, over a
                    different window, from the usage-feed panel three inches below, which is why the
                    two can legitimately differ by 3× and why a reader had to fetch raw JSON to work
                    that out. The product already disclosed provenance when the value was ABSENT
                    ("structural — no traffic observed") and hid it when the value was present: the
                    one case it explained was the harmless one.
                    A null rate means the source reported none — never zero errors. */}
                {/* AN ALARM AND AN ABSENCE ARE NOT THE SAME ELEMENT. These were one neutral chip
                    whose text flipped between "18.0% of calls failed" and "error rate not
                    reported" — a measured failure and an admission that nothing was measured,
                    rendered identically. No red threshold is invented: the product has no rule
                    saying which share is an emergency, so a non-zero share is a warning and the
                    reader judges the number. */}
                {errors
                  ? <Alarm>{errors} of calls failed</Alarm>
                  : <Absent>error rate not reported</Absent>}
                {e.p95LatencyMs != null && <Chip>p95 {e.p95LatencyMs}ms</Chip>}
                {/* The footnote, not the equal of the numbers it annotates. */}
                <Provenance>via {e.source ?? 'an unnamed source'}</Provenance>
              </>
            ) : liveness === 'unobserved' ? (
              <Absent>declared, never observed</Absent>
            ) : liveness === 'observed' ? (
              <Provenance>
                declared, last observed{' '}
                <Stamp iso={e.lastObservedAt} now={now} absent="at an unstated time" />
              </Provenance>
            ) : (
              <Absent>structural — no traffic observed</Absent>
            )}
          </li>
        );
      })}
      </ul>
      {/* The two clauses that used to live in a tooltip on the error-rate chip. One of them stopped a
          bare "100.0%" going into a Sev1 justification as "100% of orders→shipping is down": these
          are per-EDGE, from the trace source, over ITS window — a different measurement from the
          traffic panel below, which is why the two can legitimately differ by 3×. Text that prevents
          a misreading that severe cannot be reachable only by hovering. */}
      {anyMeasured && (
        <Keyline>
          Rates and error shares are per-edge, as the trace source saw them over its own window — the
          traffic panel counts the usage feed over a different one, so the two can differ.
          <strong> declared, never observed</strong> means no trace has exercised the call: a
          decommission candidate, not a fact.
        </Keyline>
      )}
    </>
  );
}
