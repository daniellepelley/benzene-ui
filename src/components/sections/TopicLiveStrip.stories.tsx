import type { Meta, StoryObj } from '@storybook/react';
import { TopicLiveStrip } from './TopicLiveStrip';

const meta = {
  title: 'Sections/TopicLiveStrip',
  component: TopicLiveStrip,
  parameters: {
    docs: {
      description: {
        component:
          'The tally rule made structural: the live plane counts over the picked window, the usage ' +
          'feed over its own baked one. Each number carries its provenance, and they are never summed.',
      },
    },
  },
  args: {
    live: {
      available: true,
      observed: 4820,
      errors: 17,
      services: ['orders-api'],
      rangeLabel: '15 minutes',
    },
    traffic: { success: 148_000, failure: 300, total: 148_300, observed: true },
  },
} satisfies Meta<typeof TopicLiveStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};

export const NoFailures: Story = {
  args: { live: { available: true, observed: 4820, errors: 0, services: ['orders-api'], rangeLabel: '15 minutes' } },
};

/** Quiet in the picked window, busy over the feed's own. Both true, and each says which it is. */
export const QuietInWindow: Story = {
  args: { live: { available: true, observed: null, errors: 0, services: [], rangeLabel: '15 minutes' } },
};

/** Neither plane has anything. The live absence is scoped to the window, not stated as "unused". */
export const NotObservedAtAll: Story = {
  args: {
    live: { available: true, observed: null, errors: 0, services: [], rangeLabel: '24 hours' },
    traffic: { success: 0, failure: 0, total: 0, observed: false },
  },
};

/** Handlers the collector actually saw — which can differ from the ones the catalog declares. */
export const MultipleObservedHandlers: Story = {
  args: {
    live: {
      available: true,
      observed: 9100,
      errors: 240,
      services: ['orders-api', 'orders-worker'],
      rangeLabel: '1 hour',
    },
  },
};

/** No collector wired: the strip is absent rather than showing zeroes it cannot vouch for. */
export const NoLivePlane: Story = {
  args: { live: { available: false, observed: null, errors: 0, services: [], rangeLabel: '15 minutes' } },
};
