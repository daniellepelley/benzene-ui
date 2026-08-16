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
      lastSeen: null,
      observed: 4820,
      errors: 17,
      avgDurationMs: 14.2,
      statusCounts: { ok: 4803, 'internal-server-error': 17 },
      registeredHandlers: ['orders-api'],
      observedHandlers: [], activityWired: false,
      missingFeeds: [],
      rangeLabel: '15 minutes',
      countsSince: null,
    },
    traffic: { success: 148_000, failure: 300, total: 148_300, observed: true, rowsForTopic: true, unrecognised: 0, versionAttributed: false },
    now: Date.parse('2026-08-09T06:00:00Z'),
  },
} satisfies Meta<typeof TopicLiveStrip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {};

export const NoFailures: Story = {
  args: {
    live: {
      available: true,
      lastSeen: null, observed: 4820, errors: 0, avgDurationMs: 11.8,
      statusCounts: { ok: 4820 }, registeredHandlers: ['orders-api'], missingFeeds: [],
      observedHandlers: [], activityWired: false,
      rangeLabel: '15 minutes', countsSince: null,
    },
  },
};

/** Quiet in the picked window, busy over the feed's own. Both true, and each says which it is. */
export const QuietInWindow: Story = {
  args: {
    live: {
      available: true,
      lastSeen: null, observed: null, errors: 0, avgDurationMs: null, statusCounts: {},
      registeredHandlers: [],
      observedHandlers: [], activityWired: false, missingFeeds: [], rangeLabel: '15 minutes', countsSince: null,
    },
  },
};

/** Neither plane has anything. The live absence is scoped to the window, not stated as "unused". */
export const NotObservedAtAll: Story = {
  args: {
    live: {
      available: true,
      lastSeen: null, observed: null, errors: 0, avgDurationMs: null, statusCounts: {},
      registeredHandlers: [],
      observedHandlers: [], activityWired: false, missingFeeds: [], rangeLabel: '24 hours', countsSince: null,
    },
    traffic: { success: 0, failure: 0, total: 0, observed: false, rowsForTopic: false, unrecognised: 0, versionAttributed: false },
  },
};

/** Handlers the collector actually saw — which can differ from the ones the catalog declares. */
export const MultipleObservedHandlers: Story = {
  args: {
    live: {
      available: true,
      lastSeen: null,
      observed: 9100,
      errors: 240,
      avgDurationMs: 88.4,
      statusCounts: { ok: 8860, 'dependency-failure': 240 },
      registeredHandlers: ['orders-api', 'orders-worker'],
      observedHandlers: [], activityWired: false,
      missingFeeds: [],
      rangeLabel: '1 hour',
      countsSince: null,
    },
  },
};

/** The counts answer a different window than the flows. Shown with their own window, never relabelled. */
export const CountsAnswerAnotherWindow: Story = {
  args: {
    live: {
      available: true,
      lastSeen: null, observed: 148320, errors: 300, avgDurationMs: 14.2,
      statusCounts: { ok: 148020 }, registeredHandlers: ['orders-api'], missingFeeds: [],
      observedHandlers: [], activityWired: false,
      rangeLabel: '15 minutes', countsSince: '2026-08-08T06:00:00Z',
    },
  },
};

/** The plane declares it cannot supply duration. Rendered as "—", never as an invented zero. */
export const DimensionAbsent: Story = {
  args: {
    live: {
      available: true,
      lastSeen: null, observed: 9100, errors: 240, avgDurationMs: null,
      statusCounts: { ok: 8860 }, registeredHandlers: ['payments-api'], missingFeeds: ['duration'],
      observedHandlers: [], activityWired: false,
      rangeLabel: '1 hour', countsSince: null,
    },
  },
};

/** No collector wired: the strip is absent rather than showing zeroes it cannot vouch for. */
export const NoLivePlane: Story = {
  args: {
    live: {
      available: false,
      lastSeen: null, observed: null, errors: 0, avgDurationMs: null, statusCounts: {},
      registeredHandlers: [],
      observedHandlers: [], activityWired: false, missingFeeds: [], rangeLabel: '15 minutes', countsSince: null,
    },
  },
};
