import type { Meta, StoryObj } from '@storybook/react';
import { Thread } from './Thread';

const meta = { title: 'Sections/Thread', component: Thread, args: { annotations: [] } } satisfies Meta<typeof Thread>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Conversation: Story = {
  args: {
    annotations: [
      { id: 'a1', entity: 'topic:order:legacy-export', author: 'Dani (PO)', text: 'Zero traffic since it was wired and no declared consumers — proposing we retire this.', createdAtUtc: '2026-07-14T10:02:00Z' },
      { id: 'a2', entity: 'topic:order:legacy-export', author: 'Sam (finance systems)', text: 'Confirmed — the nightly export moved to the warehouse pull in May.', createdAtUtc: '2026-07-15T16:41:00Z' },
    ],
  },
};
