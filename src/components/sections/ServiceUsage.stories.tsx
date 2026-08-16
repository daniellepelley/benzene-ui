import type { Meta, StoryObj } from '@storybook/react';
import { ServiceUsage } from './ServiceUsage';
import type { UsageEntriesItem } from '../../contracts';

const row = (over: Partial<UsageEntriesItem>): UsageEntriesItem => ({
  topic: 'orders:create',
  version: null,
  service: 'orders-api',
  transport: 'http',
  status: 'ok',
  count: 1200,
  avgDurationMs: 14.2,
  source: 'otel',
  ...over,
});

const meta = {
  title: 'Sections/ServiceUsage',
  component: ServiceUsage,
  parameters: {
    docs: {
      description: {
        component:
          'Keeps three states apart that a careless panel would merge: no feed, feed-wired-nothing-seen, ' +
          'and feed-wired-but-everything-seen-was-plumbing.',
      },
    },
  },
  args: {
    showUtility: false,
    now: Date.parse('2026-08-09T06:00:00Z'),
    usage: {
      mode: 'own',
      entries: [
        row({}),
        row({ topic: 'orders:create', status: 'validation-failure', count: 37 }),
        row({ topic: 'payment:capture', transport: 'sqs', count: 480 }),
      ],
      hidden: { entries: 0, messages: 0 },
      allUtility: false,
    },
  },
} satisfies Meta<typeof ServiceUsage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnCounts: Story = {};

/** Utility traffic excluded, and said so — 9.8k spec fetches would otherwise bury 11 captures. */
export const UtilityExcluded: Story = {
  args: {
    usage: {
      mode: 'own',
      entries: [row({ topic: 'payment:capture', count: 11 })],
      hidden: { entries: 3, messages: 9800 },
      allUtility: false,
    },
  },
};

/** Everything this feed saw for the service was plumbing. An empty panel would read as "no traffic". */
export const AllUtility: Story = {
  args: {
    usage: { mode: 'own', entries: [], hidden: { entries: 2, messages: 4210 }, allUtility: true },
  },
};

/** Feed wired, per-service capable, and it genuinely saw nothing. A real observation. */
export const NothingObserved: Story = {
  args: { usage: { mode: 'own', entries: [], hidden: { entries: 0, messages: 0 }, allUtility: false } },
};

/** The feed has no service dimension. The counts are shown, never passed off as the service's own. */
export const FleetWideFallback: Story = {
  args: {
    usage: {
      mode: 'fleet-wide',
      entries: [row({ service: null, count: 44_000 }), row({ topic: 'payment:capture', service: null, count: 9_100 })],
      hidden: { entries: 0, messages: 0 },
      allUtility: false,
    },
  },
};

/** A partially-dimensioned feed: some adapters carry transport, some do not. Surfaced, not guessed. */
export const PartiallyDimensioned: Story = {
  args: {
    usage: {
      mode: 'own',
      entries: [row({ transport: null, count: 320 }), row({ transport: 'http', count: 900 })],
      hidden: { entries: 0, messages: 0 },
      allUtility: false,
    },
  },
};

export const NoFeed: Story = {
  args: { usage: { mode: 'none', entries: [], hidden: { entries: 0, messages: 0 }, allUtility: false } },
};
