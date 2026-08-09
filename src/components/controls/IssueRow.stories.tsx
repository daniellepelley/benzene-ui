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
          'Classification drives severity: a mis-wiring is not the same as one bad payload. There is ' +
          'no message on the wire by design — a per-occurrence sentence would shatter one recurring ' +
          'failure into thousands of fingerprints — so the headline is composed from the stable parts.',
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
