import type { Meta, StoryObj } from '@storybook/react';
import { HealthChecks } from './HealthChecks';
import type { ServiceSnapshot } from '../../contracts';

const snap = (over: Partial<ServiceSnapshot>): ServiceSnapshot =>
  ({
    name: 'orders-api',
    fetchedAtUtc: '2026-07-16T09:15:00Z',
    specJson: null,
    specHash: null,
    previousSpecHash: null,
    contractDrift: false,
    health: null,
    error: null,
    ...over,
  }) as ServiceSnapshot;

/** `healthChecks` is a map keyed by check name — the shape `MeshServiceSnapshot` actually publishes. */
const health = (healthChecks: Record<string, unknown>, isHealthy = false) =>
  snap({ health: { isHealthy, healthChecks } as never });

const meta = {
  title: 'Sections/HealthChecks',
  component: HealthChecks,
  parameters: {
    docs: {
      description: {
        component:
          'Detail is rendered only for a non-ok check: a passing check needs no explanation, and a ' +
          "failing one needs the why — which lives in the check's own data bag.",
      },
    },
  },
  args: { snapshot: null },
} satisfies Meta<typeof HealthChecks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NotFetched: Story = {};

export const AllPassing: Story = {
  args: {
    snapshot: health(
      {
        PostgresDatabase: {
          status: 'ok',
          type: 'PostgresDatabase',
          data: { latencyMs: 6 },
          dependencies: [{ kind: 'Database', name: 'orders-db' }],
        },
        SqsQueue: { status: 'ok', type: 'SqsQueue', data: { approxDepth: 0 }, dependencies: [] },
      },
      true,
    ),
  },
};

export const Failing: Story = {
  args: {
    snapshot: health({
      PostgresDatabase: { status: 'ok', type: 'PostgresDatabase', data: { latencyMs: 6 }, dependencies: [] },
      PaymentsGateway: {
        status: 'failed',
        type: 'PaymentsGateway',
        data: { reason: 'gateway timeout', statusCode: 504 },
        dependencies: [{ kind: 'Http', name: 'stripe-gateway' }],
      },
    }),
  },
};

/** A warning is not a failure, and it still owes the reader its reason. */
export const Warning: Story = {
  args: {
    snapshot: health({
      FraudEngine: {
        status: 'warning',
        type: 'FraudEngine',
        data: { p99Ms: 850, note: 'elevated latency' },
        dependencies: [{ kind: 'Http', name: 'fraud-engine' }],
      },
    }),
  },
};

/** A failing check that reports nothing. Saying so beats an empty space the reader has to interpret. */
export const FailingWithNoDetail: Story = {
  args: { snapshot: health({ RedisCache: { status: 'failed', type: 'RedisCache', dependencies: [] } }) },
};

/** An unrecognised status is amber, never green — a status this UI has not seen is a reason to look. */
export const UnknownStatus: Story = {
  args: { snapshot: health({ Custom: { status: 'degraded-ish', type: 'Custom', data: {}, dependencies: [] } }) },
};

export const Unreachable: Story = {
  args: { snapshot: snap({ error: 'HttpRequestException: Connection refused' }) },
};

export const NoChecksPublished: Story = { args: { snapshot: health({}, true) } };
