import type { Meta, StoryObj } from '@storybook/react';
import { UsagePanel } from './UsagePanel';

const meta = {
  title: 'Controls/UsagePanel',
  component: UsagePanel,
  parameters: { docs: { description: { component: '"No usage source wired" is rendered differently from "zero traffic". Zero measured traffic is a deprecation candidate; zero because nothing measures is not a finding at all.' } } },
  args: { traffic: { success: 41230, failure: 310, total: 41540, observed: true }, windowLabel: 'in 24h' },
} satisfies Meta<typeof UsagePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};
export const Failing: Story = { args: { traffic: { success: 900, failure: 3100, total: 4000, observed: true } } };
export const MeasuredButSilent: Story = { args: { traffic: { success: 0, failure: 0, total: 0, observed: true } } };
export const NoUsageSource: Story = { args: { traffic: { success: 0, failure: 0, total: 0, observed: false } } };
