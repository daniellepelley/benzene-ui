import type { Meta, StoryObj } from '@storybook/react';
import { IssueRow } from './IssueRow';

const base = { id: 'i1', service: 'payments-api', message: 'NullReferenceException in OrderHandler', observedAtUtc: '2026-07-16T09:10:00Z', count: 1 };
const meta = {
  title: 'Controls/IssueRow',
  component: IssueRow,
  parameters: { docs: { description: { component: 'Classification drives severity: a mis-wiring is not the same as one bad payload.' } } },
  args: { issue: { ...base, classification: 'exception' } },
} satisfies Meta<typeof IssueRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Exception: Story = {};
export const ConfigWiring: Story = { args: { issue: { ...base, classification: 'config-wiring', message: 'No handler registered for orders:create' } } };
export const Validation: Story = { args: { issue: { ...base, classification: 'validation', message: 'customerEmail is required' } } };
export const ContractDrift: Story = { args: { issue: { ...base, classification: 'contract-drift', topic: 'orders:create' } } };
export const HighVolume: Story = { args: { issue: { ...base, classification: 'exception', count: 4213 } } };
export const Unclassified: Story = { args: { issue: { ...base, classification: 'unclassified' } } };
