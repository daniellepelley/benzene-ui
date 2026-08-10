import type { Meta, StoryObj } from '@storybook/react';
import { EstateStats } from './EstateStats';

const meta = {
  title: 'Controls/EstateStats',
  component: EstateStats,
  parameters: {
    docs: {
      description: {
        component:
          'The page\'s answer to "is anything wrong, and where", and it has to land in the first ' +
          'second. A zero count keeps the default colour — a red "0 unreachable" is noise, and ' +
          'noise where alarms live is how alarms get ignored.',
      },
    },
  },
  args: {
    stats: [
      { key: 'total', value: 24, label: 'Services' },
      { key: 'red', value: 2, label: 'Unhealthy', rag: 'red' },
      { key: 'amber', value: 3, label: 'Degraded', rag: 'amber' },
      { key: 'gone', value: 1, label: 'Unreachable', rag: 'gone' },
      { key: 'drift', value: 4, label: 'Contract drift', rag: 'amber' },
    ],
  },
} satisfies Meta<typeof EstateStats>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SomethingIsWrong: Story = {};

/** The healthy estate. Nothing shouts, which is the point — an all-green wall trains people to skip it. */
export const AllClear: Story = {
  args: {
    stats: [
      { key: 'total', value: 24, label: 'Services' },
      { key: 'red', value: 0, label: 'Unhealthy', rag: 'red' },
      { key: 'amber', value: 0, label: 'Degraded', rag: 'amber' },
      { key: 'gone', value: 0, label: 'Unreachable', rag: 'gone' },
      { key: 'drift', value: 0, label: 'Contract drift', rag: 'amber' },
    ],
  },
};

/** A small estate. The tiles have to look deliberate at N=3, not padded. */
export const SmallEstate: Story = {
  args: {
    stats: [
      { key: 'total', value: 3, label: 'Services' },
      { key: 'red', value: 1, label: 'Unhealthy', rag: 'red' },
      { key: 'gone', value: 1, label: 'Unreachable', rag: 'gone' },
    ],
  },
};

export const LargeNumbers: Story = {
  args: {
    stats: [
      { key: 'total', value: 1284, label: 'Services' },
      { key: 'red', value: 17, label: 'Unhealthy', rag: 'red' },
      { key: 'amber', value: 106, label: 'Degraded', rag: 'amber' },
    ],
  },
};
