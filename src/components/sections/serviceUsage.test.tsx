import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceUsage } from './ServiceUsage';
import type { ServiceUsageSummary } from '../../store/selectors';

const NOW = Date.parse('2026-08-09T06:00:00Z');

const summary = (entries: { topic: string; status: string; count: number }[]): ServiceUsageSummary => ({
  mode: 'own',
  entries: entries.map((e) => ({ ...e, service: 'billing-api', transport: 'Sqs', version: null })) as never,
  hidden: { entries: 0, messages: 0 },
  allUtility: false,
});

/**
 * "9.8k messages observed · 9.8k failed", printed directly above a breakdown reading the same count
 * under a single non-failing status, on a service with no errors anywhere. The topic surface was
 * fixed for exactly this and the service surface was not — the same defect, one render site over,
 * which is why the vocabulary now lives in a shared predicate.
 */
describe('a status this build does not recognise is not evidence of failure', () => {
  it('discloses the assumption rather than presenting it as a measurement', () => {
    render(<ServiceUsage showUtility={false} now={NOW} usage={summary([{ topic: 'invoice:raise', status: 'success', count: 9781 }])} />);

    expect(screen.getByText(/statuses this build does not recognise/)).toBeInTheDocument();
    expect(screen.getByText(/they may not be failures/i)).toBeInTheDocument();
  });

  it('says nothing extra when every status is in the known vocabulary', () => {
    render(<ServiceUsage showUtility={false} now={NOW} usage={summary([
      { topic: 'invoice:raise', status: 'ok', count: 9781 },
      { topic: 'invoice:raise', status: 'timeout', count: 3 },
    ])} />);

    expect(screen.queryByText(/does not recognise/)).not.toBeInTheDocument();
    expect(screen.getByText(/3 failed/)).toBeInTheDocument();
  });

  it('keeps counting an unrecognised status as a failure, which is the safe direction', () => {
    // Assuming the worst is right; presenting the assumption as a measurement is not.
    render(<ServiceUsage showUtility={false} now={NOW} usage={summary([{ topic: 'invoice:raise', status: 'success', count: 9781 }])} />);
    expect(screen.getByText(/9.8k failed/)).toBeInTheDocument();
  });
});
