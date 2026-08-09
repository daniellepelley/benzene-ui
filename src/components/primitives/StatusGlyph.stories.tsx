import type { Meta, StoryObj } from '@storybook/react';
import { StatusGlyph } from './StatusGlyph';

const meta = {
  title: 'Primitives/StatusGlyph',
  component: StatusGlyph,
  parameters: {
    docs: {
      description: {
        component:
          'The RAG mark. Shape as well as colour, because colour alone is not an accessible signal — ' +
          'the glyphs are carried over unchanged from the original mesh-ui so the visual language survives the port.',
      },
    },
  },
  args: { rag: 'green' },
} satisfies Meta<typeof StatusGlyph>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Healthy: Story = { args: { rag: 'green' } };
export const Degraded: Story = { args: { rag: 'amber' } };
export const Unhealthy: Story = { args: { rag: 'red' } };
export const Unreachable: Story = { args: { rag: 'gone' } };

export const AllFour: Story = {
  render: () => (
    <span style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <StatusGlyph rag="green" /> <StatusGlyph rag="amber" /> <StatusGlyph rag="red" />{' '}
      <StatusGlyph rag="gone" />
    </span>
  ),
};
