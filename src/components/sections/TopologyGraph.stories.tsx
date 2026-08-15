import type { Meta, StoryObj } from '@storybook/react';
import { TopologyGraph } from './TopologyGraph';
import type { TopologyEdgesItem } from '../../contracts';

const e = (client: string, server: string, over: Partial<TopologyEdgesItem> = {}): TopologyEdgesItem =>
  ({ client, server, source: 'tempo', requestsPerMinute: 40, errorRate: 0.01, p50LatencyMs: 10, p95LatencyMs: 40, p99LatencyMs: 90, ...over }) as TopologyEdgesItem;

const meta = {
  title: 'Sections/TopologyGraph',
  component: TopologyGraph,
  parameters: { docs: { description: { component: 'Layout is a pure function (`layoutTopology`) and is unit-tested; this component only draws it. The layering algorithm and its cycle guard are ported unchanged from the original UI.' } } },
  args: { edges: [e('orders-api', 'payments-api'), e('orders-api', 'shipping-api'), e('payments-api', 'shipping-api')] },
} satisfies Meta<typeof TopologyGraph>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Estate: Story = {};
export const Empty: Story = { args: { edges: [] } };
export const WithFailingEdge: Story = { args: { edges: [e('orders-api', 'payments-api', { errorRate: 0.4, requestsPerMinute: 200 })] } };
export const ErrorRateUnknown: Story = { args: { edges: [e('orders-api', 'payments-api', { errorRate: null })] } };
export const Cyclic: Story = {
  args: { edges: [e('a', 'b'), e('b', 'c'), e('c', 'a')] },
  parameters: { docs: { description: { story: 'A cyclic call graph settles instead of looping — real estates contain cycles.' } } },
};
export const LongNames: Story = { args: { edges: [e('a-service-with-a-very-long-name-indeed', 'b')] } };

/**
 * mesh.md §4.2: a declared edge the collector has never traced draws dashed, distinct from a
 * confirmed (declared *and* observed) edge — a decommission candidate, not a fact.
 */
export const DeclaredButNeverObserved: Story = {
  args: {
    edges: [
      e('orders-api', 'payments-api'),
      e('orders-api', 'legacy-fulfilment', { requestsPerMinute: 0, errorRate: null, lastObservedAt: null }),
    ],
  },
  parameters: { docs: { description: { story: 'orders-api → legacy-fulfilment is declared but has never been traced — dashed, per mesh.md §4.2, rather than indistinguishable from the confirmed edge beside it.' } } },
};

/** No `lastObservedAt` at all — today's rendering, unchanged until an aggregator wires the signal. */
export const LivenessNotWired: Story = {
  args: { edges: [e('orders-api', 'payments-api', { requestsPerMinute: undefined, errorRate: undefined })] },
  parameters: { docs: { description: { story: 'The aggregator has not projected mesh.md §4.2\'s liveness signal — solid, exactly like every edge before this feature existed.' } } },
};
