import type { Meta, StoryObj } from '@storybook/react';
import { SpecOperation } from './SpecOperation';

const base = {
  id: 'request:orders:create@v1',
  kind: 'request' as const,
  topic: 'orders:create',
  version: 'v1',
  reserved: false,
  httpMappings: [{ method: 'POST', path: '/orders' }],
  input: {
    type: 'object',
    title: 'CreateOrder',
    required: ['customerId'],
    properties: { customerId: { type: 'string', format: 'uuid' }, note: { type: 'string' } },
  },
  output: { type: 'object', title: 'OrderCreated', properties: { orderId: { type: 'string' } } },
  example: { customerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
};

const meta = {
  title: 'Sections/SpecOperation',
  component: SpecOperation,
  parameters: {
    docs: {
      description: {
        component:
          'Collapsed, a line to scan: how to reach it, what goes in, what comes out. Expanded, the ' +
          'payload contract. A service with forty topics is unreadable with every schema open, and ' +
          'useless if none can be.',
      },
    },
  },
  args: { operation: base, expanded: false, onToggle: () => {} },
} satisfies Meta<typeof SpecOperation>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};
export const Expanded: Story = { args: { expanded: true } };

/** Reachable by message only. "No HTTP verb" is not "unreachable", and the badge says so. */
export const MessageOnly: Story = {
  args: { operation: { ...base, httpMappings: [], topic: 'orders:archive', version: null } },
};

export const MultipleRoutes: Story = {
  args: {
    expanded: true,
    operation: {
      ...base,
      httpMappings: [
        { method: 'POST', path: '/orders' },
        { method: 'PUT', path: '/orders/{id}' },
      ],
    },
  },
};

export const Event: Story = {
  args: {
    expanded: true,
    operation: {
      id: 'event:payment:capture@v2',
      kind: 'event',
      topic: 'payment:capture',
      version: 'v2',
      reserved: false,
      httpMappings: [],
      input: { type: 'object', title: 'PaymentCapture', properties: { amount: { type: 'number' } } },
      output: null,
      example: { amount: 42.5 },
    },
  },
};

/** A benzene utility, shown only when the reader asks for them. */
export const Reserved: Story = {
  args: {
    operation: {
      ...base,
      id: 'request:benzene:spec',
      topic: 'benzene:spec',
      version: null,
      reserved: true,
      httpMappings: [],
      input: { type: 'object' },
      output: { type: 'object', title: 'ServiceSpec' },
      example: undefined,
    },
  },
};

/** No example published, so none is invented. */
export const NoExample: Story = { args: { expanded: true, operation: { ...base, example: undefined } } };
