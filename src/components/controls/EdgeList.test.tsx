import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TopologyEdgesItem } from '../../contracts';
import { EdgeList } from './EdgeList';

/** Fixed, so an age never changes under the assertions. */
const NOW = Date.parse('2026-08-16T08:50:00Z');

/**
 * A topology edge exists in two honest states: measured — a trace source (Tempo/Jaeger/X-Ray) observed
 * the call and reported traffic — and structural — the call is only *declared* by the services' contracts,
 * with no trace source wired, so it carries no metrics. The metrics are therefore optional on the wire.
 *
 * The service page's "Calls" section reads `requestsPerMinute.toFixed(1)` straight off each edge; on a
 * structural edge that number is absent, and the unguarded read used to throw and white-screen the whole
 * page (an estate with no trace source, e.g. the AWS Lambda mesh example, hit exactly this). These prove
 * the structural edge renders as a stated absence rather than a crash — and that a measured edge still
 * shows its numbers.
 */
const edge = (over: Partial<TopologyEdgesItem>): TopologyEdgesItem =>
  ({ client: 'orders-api', server: 'payments-api', source: 'structural', ...over }) as TopologyEdgesItem;

describe('EdgeList — structural vs measured edges', () => {
  it('renders a structural edge (no traffic metrics) without crashing', () => {
    render(<EdgeList edges={[edge({})]} show="server" emptyMessage="none" now={NOW} />);
    expect(screen.getByText('payments-api')).toBeInTheDocument();
    expect(screen.getByText('structural — no traffic observed')).toBeInTheDocument();
  });

  it('shows the numbers for a measured edge', () => {
    render(
      <EdgeList
        edges={[edge({ source: 'tempo', requestsPerMinute: 86.4, errorRate: 0.18, p95LatencyMs: 420 })]}
        show="server"
        emptyMessage="none" now={NOW}
      />,
    );
    expect(screen.getByText('86.4/min')).toBeInTheDocument();
    // THE NOUN AND THE SOURCE. A bare `18.0%` chip nearly went into a Sev1 justification as a claim
    // about the whole service; it is the share of calls on this edge that the trace source saw fail,
    // measured over a different window from the usage panel below it.
    expect(screen.getByText('18.0% of calls failed')).toBeInTheDocument();
    expect(screen.getByText('measured by tempo')).toBeInTheDocument();
    expect(screen.getByText('p95 420ms')).toBeInTheDocument();
    expect(screen.queryByText('structural — no traffic observed')).not.toBeInTheDocument();
  });

  it('keeps a measured edge whose error rate the source did not report', () => {
    render(
      <EdgeList
        edges={[edge({ source: 'tempo', requestsPerMinute: 6.2, errorRate: null, p95LatencyMs: 15 })]}
        show="server"
        emptyMessage="none" now={NOW}
      />,
    );
    expect(screen.getByText('6.2/min')).toBeInTheDocument();
    expect(screen.getByText('error rate not reported')).toBeInTheDocument();
  });
});

/**
 * mesh.md §4.2: distinct from measured vs. structural above. `lastObservedAt` answers a narrower
 * question — has *this* declared edge ever been traced — independent of whether a rate/latency
 * source is wired at all. Absent (`undefined`) must render exactly like today's structural edge.
 */
describe('EdgeList — declared vs. observed (mesh.md §4.2)', () => {
  it('renders today\'s structural message when the aggregator has not wired liveness at all', () => {
    render(<EdgeList edges={[edge({})]} show="server" emptyMessage="none" now={NOW} />);
    expect(screen.getByText('structural — no traffic observed')).toBeInTheDocument();
  });

  it('flags a declared edge no trace has ever exercised as a decommission candidate', () => {
    render(<EdgeList edges={[edge({ lastObservedAt: null })]} show="server" emptyMessage="none" now={NOW} />);
    expect(screen.getByText('declared — never observed')).toBeInTheDocument();
    expect(screen.queryByText('structural — no traffic observed')).not.toBeInTheDocument();
  });

  it('shows when a declared, unmetered edge was last traced', () => {
    render(
      <EdgeList
        edges={[edge({ lastObservedAt: '2026-08-15T08:50:00Z' })]}
        show="server"
        emptyMessage="none" now={NOW}
      />,
    );
    // The DATE AND THE AGE, per the rule. A raw ISO string made the reader subtract, and this row is
    // the one place `mesh.md` §4.2's "last observed at" reaches the screen — the age is the half that
    // decides whether an edge is a decommission candidate.
    expect(screen.getByText(/declared — last observed/)).toBeInTheDocument();
    expect(screen.getByText('2026-08-15 08:50 UTC')).toBeInTheDocument();
    expect(screen.getByText('(24h ago)')).toBeInTheDocument();
  });
});
