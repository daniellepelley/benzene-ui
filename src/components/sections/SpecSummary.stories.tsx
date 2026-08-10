import type { Meta, StoryObj } from '@storybook/react';
import { SpecSummary } from './SpecSummary';

const meta = {
  title: 'Sections/SpecSummary',
  component: SpecSummary,
  parameters: {
    docs: {
      description: {
        component:
          'Domain topics only — the reserved utilities every Benzene service carries would inflate ' +
          'every count identically and say nothing about this service.',
      },
    },
  },
  args: {
    summary: {
      topics: 12, httpMapped: 8, events: 3, schemas: 21, utilities: 4,
      transports: ['http', 'sqs'], messageEndpoint: '/benzene/invoke',
    },
  },
} satisfies Meta<typeof SpecSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};

/** No message endpoint: this service cannot be sent a composed message, and the composer detects that. */
export const NoMessageEndpoint: Story = {
  args: { summary: { topics: 4, httpMapped: 4, events: 0, schemas: 6, utilities: 4, transports: ['http'], messageEndpoint: null } },
};

/** A host with no registered transport info at all — uncommon, but the field is simply absent. */
export const NoTransportsDeclared: Story = {
  args: { summary: { topics: 4, httpMapped: 0, events: 2, schemas: 6, utilities: 4, transports: [], messageEndpoint: null } },
};

export const NothingExposed: Story = {
  args: { summary: { topics: 0, httpMapped: 0, events: 0, schemas: 0, utilities: 0, transports: [], messageEndpoint: null } },
};
