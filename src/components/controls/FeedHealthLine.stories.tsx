import type { Meta, StoryObj } from '@storybook/react';
import { FeedHealthLine } from './FeedHealthLine';

const meta = {
  title: 'Controls/FeedHealthLine',
  component: FeedHealthLine,
  parameters: {
    docs: {
      description: {
        component:
          'Tells the reader whether to believe the silence. The warn state is the important one: a ' +
          'collector that answers every poll but has never reported traffic is almost certainly a ' +
          'broken exporter, and rendering that as calm green is how a dashboard lies.',
      },
    },
  },
  args: { health: { kind: 'ok', text: 'live · polled 4s ago · last activity 12s ago' } },
} satisfies Meta<typeof FeedHealthLine>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Hidden by default — a healthy feed on the estate page is chrome. */
export const HealthyOnEstate: Story = {};

export const HealthyOnLiveSurface: Story = { args: { showWhenHealthy: true } };

export const Blind: Story = {
  args: {
    health: {
      kind: 'warn',
      text:
        'live plane connected, but no traffic has been observed since this page loaded (12 topics ' +
        'declared) — if traffic is flowing, check the exporter wiring',
    },
  },
};

export const Unreachable: Story = {
  args: {
    health: {
      kind: 'bad',
      text: 'live plane unreachable — last successful poll 4m ago; the live data shown is stale',
    },
  },
};

export const NeverReached: Story = {
  args: {
    health: {
      kind: 'bad',
      text: 'live plane unreachable — no successful poll yet (last attempt 8s ago); retrying',
    },
  },
};

/** No collector wired at all. Not a fault, so not a warning — the line simply is not there. */
export const NoLivePlane: Story = { args: { health: null } };
