import type { Meta, StoryObj } from '@storybook/react';
import { Chip } from './Chip';

const meta = { title: 'Primitives/Chip', component: Chip, args: { children: 'orders:created' } } satisfies Meta<typeof Chip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Topic: Story = {};
export const WithTitle: Story = { args: { children: '3 consumers', title: 'orders-api, billing, search' } };
