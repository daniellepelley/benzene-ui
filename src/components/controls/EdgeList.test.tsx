import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TopologyEdgesItem } from '../../contracts';
import { EdgeList } from './EdgeList';

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
    render(<EdgeList edges={[edge({})]} show="server" emptyMessage="none" />);
    expect(screen.getByText('payments-api')).toBeInTheDocument();
    expect(screen.getByText('structural — no traffic observed')).toBeInTheDocument();
  });

  it('shows the numbers for a measured edge', () => {
    render(
      <EdgeList
        edges={[edge({ source: 'tempo', requestsPerMinute: 86.4, errorRate: 0.18, p95LatencyMs: 420 })]}
        show="server"
        emptyMessage="none"
      />,
    );
    expect(screen.getByText('86.4/min')).toBeInTheDocument();
    expect(screen.getByText('18.0%')).toBeInTheDocument();
    expect(screen.getByText('p95 420ms')).toBeInTheDocument();
    expect(screen.queryByText('structural — no traffic observed')).not.toBeInTheDocument();
  });

  it('keeps a measured edge whose error rate the source did not report', () => {
    render(
      <EdgeList
        edges={[edge({ source: 'tempo', requestsPerMinute: 6.2, errorRate: null, p95LatencyMs: 15 })]}
        show="server"
        emptyMessage="none"
      />,
    );
    expect(screen.getByText('6.2/min')).toBeInTheDocument();
    expect(screen.getByText('errors unknown')).toBeInTheDocument();
  });
});
