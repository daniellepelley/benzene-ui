import type { Meta, StoryObj } from '@storybook/react';
import { ServiceCard } from './ServiceCard';

const meta = {
  title: 'Controls/ServiceCard',
  component: ServiceCard,
  parameters: {
    docs: {
      description: {
        component:
          'One service in the estate. It holds no state — `expanded` arrives as a prop and toggling ' +
          'calls back, so the same card renders identically whether it is driven by the Redux store or ' +
          'by a consumer supplying their own props.',
      },
    },
  },
  args: {
    service: { name: 'orders-api', status: 'healthy', contractDrift: false },
    rag: 'green',
    expanded: false,
    onToggle: () => {},
    onOpen: () => {},
  },
} satisfies Meta<typeof ServiceCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

export const Unhealthy: Story = {
  args: { service: { name: 'payments-api', status: 'unhealthy', contractDrift: false }, rag: 'red' },
};

export const WithContractDrift: Story = {
  args: {
    service: { name: 'payments-api', status: 'unhealthy', contractDrift: true },
    rag: 'red',
  },
};

export const Unreachable: Story = {
  args: {
    service: { name: 'shipping-api', status: 'unreachable', contractDrift: false },
    rag: 'gone',
  },
};

export const WithOwningTeam: Story = {
  args: {
    service: { name: 'orders-api', status: 'healthy', contractDrift: false, owningTeam: 'Fulfilment' },
    rag: 'green',
  },
};

export const Expanded: Story = {
  args: { expanded: true, children: <p style={{ margin: 0 }}>Topics, health checks and usage go here.</p> },
};

/**
 * The status moved since the last refresh, so the card settles out of its RAG colour once.
 *
 * One settle, not a pulse: a card that keeps moving is motion in the place alarms live, and readers
 * learn to look away from that — the opposite of the point. The tint is the card's own colour, so
 * the flash says *which way* it moved; a service going red and a service recovering are different
 * news. In Storybook the animation has already finished by the time you read this, which is exactly
 * how it should behave — reload the story to see it.
 */
export const StatusJustChanged: Story = {
  args: {
    service: { name: 'payments-api', status: 'unhealthy', contractDrift: false },
    rag: 'red',
    changed: true,
  },
};

/** The arrival case: a service that was not in the previous manifest at all. */
export const JustAppeared: Story = {
  args: {
    service: { name: 'inventory-api', status: 'healthy', contractDrift: false },
    rag: 'green',
    changed: true,
  },
};
