import type { Meta, StoryObj } from '@storybook/react';
import { FlowList } from './FlowList';
import type { FleetTrace } from '../../store/slices/fleetSlice';

const flow = (over: Partial<FleetTrace> = {}): FleetTrace => ({
  traceId: '1-68c0a1e0-2a3b4c5d6e7f8091a2b3c4d5',
  events: 4,
  services: ['orders-api'],
  startedAt: '2026-08-09T05:59:30Z',
  durationMs: 18.1,
  failed: false,
  ...over,
});

const view = (flows: FleetTrace[], over = {}) => ({
  available: true,
  flows,
  failing: flows.filter((f) => f.failed).length,
  total: flows.length,
  sampledOut: false,
  ...over,
});

const meta = {
  title: 'Controls/FlowList',
  component: FlowList,
  parameters: {
    docs: {
      description: {
        component:
          'Issues say what is wrong; a flow says what happened. An error count with no way through ' +
          'to an example is a dead end, and dead ends teach readers to stop looking.',
      },
    },
  },
  args: {
    failingOnly: false,
    view: view([
      flow({ topic: 'payment:capture', services: ['orders-api', 'payments-api'], durationMs: 212.7, events: 7, failed: true, traceId: '1-68c0a1f2-4b1c9e3a5d6f7089ab12cd34' }),
      flow({ topic: 'orders:create' }),
      flow({ traceId: '1-68c0a1c4-9f8e7d6c5b4a39281706f5e4', topic: 'orders:create', durationMs: 22.4 }),
    ]),
  },
} satisfies Meta<typeof FlowList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Recent: Story = {};

/** The pivot's destination: an error count drilled into. */
export const FailingOnly: Story = {
  args: {
    failingOnly: true,
    view: view(
      [flow({ topic: 'payment:capture', failed: true, durationMs: 212.7, services: ['orders-api', 'payments-api'] })],
      { failing: 1, total: 4 },
    ),
  },
};

/** A flow the plane could not attribute to an entry topic. Left unclaimed rather than guessed at. */
export const Unattributed: Story = { args: { view: view([flow({ topic: undefined })]) } };

/**
 * Traffic observed, no flows returned. Flows are sampled and capped, and a counts-only poll asks for
 * none — so an empty list here is a statement about the plane, not about the estate.
 */
export const SampledOut: Story = {
  args: { view: view([], { sampledOut: true, total: 0 }), subject: 'payment:capture' },
};

export const GenuinelyQuiet: Story = { args: { view: view([]), subject: 'payment:capture' } };

export const NoFailures: Story = {
  args: { failingOnly: true, view: view([], { failing: 0, total: 12 }), subject: 'orders:create' },
};

/** No collector wired: the section is absent rather than claiming nothing happened. */
export const NoLivePlane: Story = { args: { view: view([], { available: false }) } };
