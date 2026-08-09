import type { Meta, StoryObj } from '@storybook/react';
import { LiveStrip } from './LiveStrip';

const meta = {
  title: 'Controls/LiveStrip',
  component: LiveStrip,
  parameters: {
    docs: {
      description: {
        component:
          'The observed plane for one service. `silent` (never reported) is deliberately distinct ' +
          'from `stale` (reported, then stopped) — a service with no reporting middleware wired is ' +
          'not a failing service, and saying so is how the dashboard keeps its credibility.',
      },
    },
  },
  args: { liveness: 'live', issueCount: 0, diverged: false },
} satisfies Meta<typeof LiveStrip>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Live: Story = {};
export const Stale: Story = { args: { liveness: 'stale' } };
export const NeverReported: Story = { args: { liveness: 'silent' } };
export const WithIssues: Story = { args: { liveness: 'live', issueCount: 403 } };
export const Diverged: Story = {
  args: { liveness: 'stale', diverged: true, issueCount: 12 },
};
