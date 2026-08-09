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
