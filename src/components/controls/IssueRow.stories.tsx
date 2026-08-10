import type { Meta, StoryObj } from '@storybook/react';
import { IssueRow } from './IssueRow';
import type { MeshIssue } from '../../contracts';

const base: MeshIssue = {
  fingerprint: '9f2c4b81a03d5e67',
  classification: 'exception',
  service: 'payments-api',
  topic: 'payment:capture',
  status: 'internal-server-error',
  exceptionType: 'System.NullReferenceException',
  count: 1,
  firstSeen: '2026-08-09T05:00:00Z',
  lastSeen: '2026-08-09T05:59:00Z',
  exemplarTraceIds: [],
};

const meta = {
  title: 'Controls/IssueRow',
  component: IssueRow,
  parameters: {
    docs: {
      description: {
        component:
          'Severity and classification are two axes. The dot carries severity; the classification is a ' +
          'neutral label. Merging them painted a failing payload green, and green means healthy ' +
          'everywhere else in this product. The "why" line exists because `config-wiring on ' +
          'orders:create` tells a developer something and a business analyst nothing.',
      },
    },
  },
  args: { issue: base },
} satisfies Meta<typeof IssueRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Exception: Story = {};

/** No exception type: the emitter had none, so the Benzene status carries the headline instead. */
export const StatusOnly: Story = {
  args: {
    issue: {
      ...base,
      classification: 'config-wiring',
      status: 'not-found',
      exceptionType: undefined,
      topic: 'orders:create',
      resolutionHint: 'no-handler',
    },
  },
};

export const Validation: Story = {
  args: { issue: { ...base, classification: 'validation', status: 'bad-request', exceptionType: undefined } },
};

export const ContractDrift: Story = {
  args: { issue: { ...base, classification: 'contract-drift', version: 'v2' } },
};

export const Dependency: Story = {
  args: {
    issue: {
      ...base,
      classification: 'dependency',
      status: 'dependency-failure',
      exceptionType: 'System.Net.Http.HttpRequestException',
      resolutionHint: 'dependency',
    },
  },
};

/** Occurrences, not distinct issues — 4,213 of one thing outranks four of four things. */
export const HighVolume: Story = { args: { issue: { ...base, count: 4213 } } };

export const Unclassified: Story = {
  args: { issue: { ...base, classification: 'unclassified', exceptionType: undefined } },
};
