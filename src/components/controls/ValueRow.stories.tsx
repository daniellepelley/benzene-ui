import type { Meta, StoryObj } from '@storybook/react';
import { ValueRow } from './ValueRow';

const meta = { title: 'Controls/ValueRow', component: ValueRow, args: { label: 'Owning team', children: 'Fulfilment' } } satisfies Meta<typeof ValueRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Plain: Story = {};
export const WithTooltip: Story = { args: { label: 'Spec hash', children: 'a1b2c3d4', title: 'Hash of the published spec document' } };
