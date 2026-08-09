import type { Meta, StoryObj } from '@storybook/react';
import { SchemaTree } from './SchemaTree';

const meta = { title: 'Sections/SchemaTree', component: SchemaTree, args: { schema: null } } satisfies Meta<typeof SchemaTree>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NoSchema: Story = {};
export const Object: Story = {
  args: {
    schema: {
      title: 'CreateOrder', type: 'object', required: ['orderId', 'amount'],
      properties: {
        orderId: { type: 'string', format: 'uuid' },
        amount: { type: 'number', minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        status: { type: 'string', enum: ['pending', 'settled'] },
      },
    },
  },
};
export const Nested: Story = {
  args: {
    schema: {
      type: 'object', required: ['lines'],
      properties: {
        lines: { type: 'array', items: { type: 'object', required: ['sku'], properties: { sku: { type: 'string', pattern: '^[A-Z]{3}-\\d+$' }, quantity: { type: 'integer', minimum: 1 } } } },
      },
    },
  },
};
export const ArrayRoot: Story = {
  args: { schema: { type: 'array', items: { title: 'OrderDto', type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] } } },
};
