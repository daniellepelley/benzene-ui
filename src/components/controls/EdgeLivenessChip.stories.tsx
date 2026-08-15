import type { Meta, StoryObj } from '@storybook/react';
import { EdgeLivenessChip } from './EdgeLivenessChip';

const meta = {
  title: 'Controls/EdgeLivenessChip',
  component: EdgeLivenessChip,
  parameters: {
    docs: {
      description: {
        component:
          'mesh.md §4.2\'s "declared, unobserved" state, as a small qualifier beside a consumer or ' +
          'producer name on the topic page. Silent for the confirmed (declared and observed) case, ' +
          'and silent when the aggregator has not projected the signal at all — a missing chip is ' +
          'never a claim of confirmation.',
      },
    },
  },
} satisfies Meta<typeof EdgeLivenessChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NotWired: Story = { args: { activity: undefined } };
export const Observed: Story = { args: { activity: { lastObservedAt: '2026-08-15T08:50:00Z' } } };
export const Unobserved: Story = { args: { activity: {} } };
