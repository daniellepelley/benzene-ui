import type { Meta, StoryObj } from '@storybook/react';
import { CollapsibleSection } from './CollapsibleSection';

const meta = {
  title: 'Controls/CollapsibleSection',
  component: CollapsibleSection,
  parameters: {
    docs: {
      description: {
        component:
          'Hides the body, never the header — so a section a reader put away stops competing for ' +
          'the top of the page without becoming undiscoverable. That is why this is a collapse and ' +
          'not a tab: nobody clicks a tab for a view they do not know exists, but they will read a ' +
          'heading. `open` is a prop, so which sections are away is store state and survives ' +
          'navigating.',
      },
    },
  },
  args: {
    id: 'topology',
    title: 'Topology',
    open: true,
    onToggle: () => {},
    children: <p>Who talks to whom.</p>,
  },
} satisfies Meta<typeof CollapsibleSection>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

/** Put away. The heading and its note stay, which is the whole point. */
export const Collapsed: Story = { args: { open: false } };

/**
 * A note beside the title. It shows whether the body is open or not — a collapsed section that is
 * hiding a problem has to say so, or collapsing it becomes a way to lose the problem.
 */
export const WithNote: Story = {
  args: { id: 'topics', title: 'Topics', note: '3 flagged', open: false },
};
