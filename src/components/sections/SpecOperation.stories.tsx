import type { Meta, StoryObj } from '@storybook/react';
import { SpecOperation } from './SpecOperation';

const base = {
  id: 'request:orders:create@v1',
  kind: 'request' as const,
  topic: 'orders:create',
  version: 'v1',
  httpMappings: [{ method: 'POST', path: '/orders' }],
  input: {
    type: 'object',
    title: 'CreateOrder',
    required: ['customerId'],
    properties: { customerId: { type: 'string', format: 'uuid' }, note: { type: 'string' } },
  },
  output: { type: 'object', title: 'OrderCreated', properties: { orderId: { type: 'string' } } },
  example: { customerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6' },
  exampleSource: 'document' as const,
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
      httpMappings: [],
      input: { type: 'object', title: 'PaymentCapture', properties: { amount: { type: 'number' } } },
      output: null,
      example: { amount: 42.5 },
      exampleSource: 'document',
    },
  },
};

/** A send to a topic another party defines, one-way: no response is declared, so none comes back. */
export const OneWaySend: Story = {
  args: {
    expanded: true,
    operation: {
      id: 'send:payment:capture@v2',
      kind: 'send',
      topic: 'payment:capture',
      version: 'v2',
      httpMappings: [],
      input: { type: 'object', title: 'PaymentCapture', properties: { amount: { type: 'number' } } },
      output: null,
      example: { amount: 0 },
      exampleSource: 'generated',
    },
  },
};

/** A handler that returns no payload: the response is absent, which is said, never drawn as a dash. */
export const NoResponse: Story = {
  args: { expanded: true, operation: { ...base, id: 'request:orders:cancel', topic: 'orders:cancel', version: null, httpMappings: [], output: null } },
};

/** The service supplied no example, so this viewer generates one from the schema — and says so. */
export const GeneratedExample: Story = {
  args: { expanded: true, operation: { ...base, example: { customerId: '00000000-0000-0000-0000-000000000000', note: 'string' }, exampleSource: 'generated' } },
};

/** No example and nothing to generate one from (`{}` is any payload). */
export const NoExample: Story = { args: { expanded: true, operation: { ...base, input: {}, example: undefined, exampleSource: null } } };
