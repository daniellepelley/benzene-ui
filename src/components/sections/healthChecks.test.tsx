import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthChecks } from './HealthChecks';
import payments from '../../../contracts/artifacts/services/payments-api.json';
import shipping from '../../../contracts/artifacts/services/shipping-api.json';
import type { ServiceSnapshot } from '../../contracts';

/**
 * Driven by the vendored artifacts on purpose.
 *
 * The bug this exists to prevent was reading `health.checks[]`, a shape the contract has never had:
 * `healthChecks` is a map keyed by check name. Hand-written fixtures agreed with the component and
 * both were wrong together, so every service reported "published no health checks" while publishing
 * three. Only real artifacts catch that.
 */
describe('health checks', () => {
  it('renders every check the real artifact publishes', () => {
    render(<HealthChecks snapshot={payments as unknown as ServiceSnapshot} />);

    expect(screen.getByText('PaymentsGateway')).toBeInTheDocument();
    expect(screen.getByText('PostgresDatabase')).toBeInTheDocument();
    expect(screen.getByText('FraudEngine')).toBeInTheDocument();
  });

  it('explains a failing check and stays quiet about a passing one', () => {
    // A passing check needs no detail; a failure owes the reader its reason.
    render(<HealthChecks snapshot={payments as unknown as ServiceSnapshot} />);

    expect(screen.getByText('gateway timeout')).toBeInTheDocument();
    expect(screen.queryByText('6')).not.toBeInTheDocument(); // PostgresDatabase's latencyMs, ok
  });

  it('names each check\'s dependencies', () => {
    render(<HealthChecks snapshot={payments as unknown as ServiceSnapshot} />);
    expect(screen.getByText('stripe-gateway')).toBeInTheDocument();
    expect(screen.getByText('payments-db')).toBeInTheDocument();
  });

  it('explains an unreachable service instead of showing an empty panel', () => {
    render(<HealthChecks snapshot={shipping as unknown as ServiceSnapshot} />);
    expect(screen.getByText(/Could not reach this service/)).toBeInTheDocument();
  });

  it('treats an unrecognised status as amber, never as passing', () => {
    // A status this UI has never seen is a reason to look, not a reason to relax — and it must not
    // suppress the detail the way an `ok` does.
    const snapshot = {
      ...(payments as unknown as ServiceSnapshot),
      health: { isHealthy: false, healthChecks: { Custom: { status: 'weird', data: { why: 'unclear' } } } },
    } as unknown as ServiceSnapshot;

    render(<HealthChecks snapshot={snapshot} />);
    expect(screen.getByRole('img', { name: 'weird' })).toBeInTheDocument();
    expect(screen.getByText('unclear')).toBeInTheDocument();
  });

  it('says a failing check reported nothing rather than leaving a gap', () => {
    const snapshot = {
      ...(payments as unknown as ServiceSnapshot),
      health: { isHealthy: false, healthChecks: { RedisCache: { status: 'failed' } } },
    } as unknown as ServiceSnapshot;

    render(<HealthChecks snapshot={snapshot} />);
    expect(screen.getByText(/No further detail reported/)).toBeInTheDocument();
  });
});

/**
 * A payload this build cannot read is not the same as no payload. A snapshot carrying `health` in a
 * shape without `healthChecks` rendered as "This service published no health checks" — an assertion
 * about the reader's service that the product had not earned. Same defect as an unreadable feed
 * reported as an empty estate, one level down.
 */
describe('an unreadable health payload is not an absent one', () => {
  it('says it could not read the payload rather than that none was published', () => {
    render(<HealthChecks snapshot={{ name: 'x', health: 'fine' } as never} />);
    expect(screen.getByText(/could not read/)).toBeInTheDocument();
    expect(screen.queryByText(/published no health checks/)).toBeNull();
  });

  it('treats a list where a map is expected as unreadable, not as empty', () => {
    render(<HealthChecks snapshot={{ name: 'x', health: { healthChecks: [] } } as never} />);
    expect(screen.getByText(/could not read/)).toBeInTheDocument();
  });

  it('still says "none published" when the service genuinely published none', () => {
    render(<HealthChecks snapshot={{ name: 'x', health: { healthChecks: {} } } as never} />);
    expect(screen.getByText('This service published no health checks.')).toBeInTheDocument();
  });

  it('says nothing about health when there is no health payload at all', () => {
    render(<HealthChecks snapshot={{ name: 'x' } as never} />);
    expect(screen.getByText('This service published no health checks.')).toBeInTheDocument();
  });
});
