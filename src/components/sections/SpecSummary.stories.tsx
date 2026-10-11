import type { Meta, StoryObj } from '@storybook/react';
import { SpecSummary } from './SpecSummary';

const meta = {
  title: 'Sections/SpecSummary',
  component: SpecSummary,
  parameters: {
    docs: {
      description: {
        component:
          "The service's own topics only — Benzene's `benzene:` utilities are never part of a " +
          'Contract Document, and are dropped from a legacy document that listed them.',
      },
    },
  },
  args: {
    summary: {
      topics: 12, httpMapped: 8, events: 3, sends: 2, schemas: 21,
      transports: ['http', 'sqs'], messageEndpoint: '/benzene/invoke',
      contractHash: 'sha256:770f508339e7cdec6edac0f7ab851936a6e31e2e82baa75bdc094e68ac7eeb34',
    },
  },
} satisfies Meta<typeof SpecSummary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {};

/** No message endpoint: this service cannot be sent a composed message, and the composer detects that. */
export const NoMessageEndpoint: Story = {
  args: { summary: { topics: 4, httpMapped: 4, events: 0, sends: 0, schemas: 6, transports: ['http'], messageEndpoint: null, contractHash: null } },
};

/** A host with no registered transport info at all — uncommon, but the field is simply absent. */
export const NoTransportsDeclared: Story = {
  args: { summary: { topics: 4, httpMapped: 0, events: 2, sends: 1, schemas: 6, transports: [], messageEndpoint: null, contractHash: null } },
};

export const NothingExposed: Story = {
  args: { summary: { topics: 0, httpMapped: 0, events: 0, sends: 0, schemas: 0, transports: [], messageEndpoint: null, contractHash: null } },
};
