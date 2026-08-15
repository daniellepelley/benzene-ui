import type { Meta, StoryObj } from '@storybook/react';
import { EdgeList } from './EdgeList';
import type { TopologyEdgesItem } from '../../contracts';

const e = (over: Partial<TopologyEdgesItem>): TopologyEdgesItem =>
  ({ client: 'orders-api', server: 'payments-api', source: 'tempo', requestsPerMinute: 86.4, errorRate: 0.18, p50LatencyMs: 45, p95LatencyMs: 420, p99LatencyMs: 890, ...over }) as TopologyEdgesItem;

const meta = { title: 'Controls/EdgeList', component: EdgeList, args: { edges: [e({})], show: 'server', emptyMessage: 'Nothing observed.' } } satisfies Meta<typeof EdgeList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Outbound: Story = {};
export const Inbound: Story = { args: { show: 'client' } };
export const Empty: Story = { args: { edges: [] } };
export const ErrorRateNotReported: Story = {
  args: { edges: [e({ errorRate: null })] },
  parameters: { docs: { description: { story: 'A null error rate is "not reported", not zero — drawn as unknown rather than healthy.' } } },
};

const structural = (over: Partial<TopologyEdgesItem>): TopologyEdgesItem =>
  ({ client: 'orders-api', server: 'legacy-fulfilment', source: 'structural', ...over }) as TopologyEdgesItem;

/** No metrics source at all — today's baseline, unchanged when the aggregator hasn't wired mesh.md §4.2. */
export const Structural: Story = {
  args: { edges: [structural({})] },
  parameters: { docs: { description: { story: 'Declared by the services’ contracts; no trace source is wired at all.' } } },
};

/** mesh.md §4.2's "declared, unobserved" state — a decommission candidate, never a fact. */
export const DeclaredNeverObserved: Story = {
  args: { edges: [structural({ lastObservedAt: null })] },
  parameters: { docs: { description: { story: 'A declared edge no trace has ever exercised — mesh.md §4.2’s liveness signal, distinct from "no metrics source wired".' } } },
};

/** Declared and traced, but no rate/latency source computed metrics for it. */
export const DeclaredLastObserved: Story = {
  args: { edges: [structural({ lastObservedAt: '2026-08-15T08:50:00Z' })] },
  parameters: { docs: { description: { story: 'Declared and traced at least once, even though no metrics source is wired for this edge.' } } },
};
