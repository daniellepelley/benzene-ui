import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Primitives/EmptyState',
  component: EmptyState,
  args: { message: 'No services match this filter.' },
} satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoMatches: Story = {};
export const NothingCollected: Story = {
  args: { message: 'No traces collected in this window — the collector may not be reachable.' },
};
