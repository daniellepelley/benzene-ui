import type { Meta, StoryObj } from '@storybook/react';
import { ThemeToggle } from './ThemeToggle';

const meta = {
  title: 'Controls/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    docs: {
      description: {
        component:
          'Three states, not two. "Follow the system" is a real answer and the common one — a ' +
          'two-state switch has to pick a side on first paint and thereby overrides a preference ' +
          'the reader already gave their OS. The state is in the accessible label as well as the ' +
          'glyph: a moon could mean "dark is on" or "click for dark", and an ambiguous control ' +
          'gets clicked twice.',
      },
    },
  },
  args: { theme: 'system', onCycle: () => {} },
} satisfies Meta<typeof ThemeToggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FollowingTheSystem: Story = {};
export const ForcedLight: Story = { args: { theme: 'light' } };
export const ForcedDark: Story = { args: { theme: 'dark' } };
