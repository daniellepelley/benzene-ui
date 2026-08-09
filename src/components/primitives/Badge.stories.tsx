import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  args: { children: 'healthy', rag: 'green' },
} satisfies Meta<typeof Badge>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};
export const Unhealthy: Story = { args: { children: 'unhealthy', rag: 'red' } };
export const Drift: Story = {
  args: { children: 'drift', rag: 'amber', title: 'The published spec has changed' },
};
export const Neutral: Story = { args: { children: 'v2', rag: undefined } };
