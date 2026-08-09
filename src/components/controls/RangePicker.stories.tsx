import type { Meta, StoryObj } from '@storybook/react';
import { RangePicker } from './RangePicker';
import { RANGE_OPTIONS } from '../../store/selectors';

const meta = {
  title: 'Controls/RangePicker',
  component: RangePicker,
  parameters: {
    docs: {
      description: {
        component:
          'Sits beside the live figures it qualifies, not in a settings panel — a reader who cannot ' +
          'see the window while reading the number has no way to know what the number means.',
      },
    },
  },
  args: { rangeMs: RANGE_OPTIONS[0]!.ms, options: RANGE_OPTIONS },
} satisfies Meta<typeof RangePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const LongWindow: Story = { args: { rangeMs: 24 * 60 * 60_000 } };

/** No collector wired. A window control over nothing is a control that lies about what exists. */
export const NoLivePlane: Story = { args: { available: false } };
