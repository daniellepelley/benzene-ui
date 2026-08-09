import type { Meta, StoryObj } from '@storybook/react';
import { RetirementRow } from './RetirementRow';
import type { TopicsTopicsItem } from '../../contracts';

const topic = (over: Partial<TopicsTopicsItem> = {}): TopicsTopicsItem => ({
  topic: 'order:legacy-export',
  version: 'v1',
  reserved: false,
  consumers: [],
  producers: [{ service: 'orders-api' }],
  status: null,
  requestSchema: null,
  responseSchema: null,
  messageSchema: null,
  schemaMismatch: false,
  ...over,
});

const meta = {
  title: 'Controls/RetirementRow',
  component: RetirementRow,
  parameters: {
    docs: {
      description: {
        component:
          'One topic in the value view. The evidence strip is the whole point — a row that only ' +
          'asserted "candidate" would be something to take on trust rather than something to act on.',
      },
    },
  },
  args: {
    rag: 'red',
    row: {
      entry: topic(),
      usageTotal: 0,
      evidence: ['no declared consumers', 'no traffic observed while the usage feed is wired'],
    },
  },
} satisfies Meta<typeof RetirementRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const StrongCandidate: Story = {};

/** No usage feed wired: the structural case stands alone, and says so. */
export const Unmeasured: Story = {
  args: { row: { entry: topic(), usageTotal: null, evidence: ['no declared consumers'] } },
};

export const VerifyExternally: Story = {
  args: {
    rag: 'amber',
    row: {
      entry: topic({ topic: 'partner:settlement', status: 'gap', producers: [] , consumers: [{ service: 'billing-api', httpMappings: [] }] }),
      usageTotal: 0,
      evidence: ['produced outside this fleet (gap)', 'no traffic observed'],
    },
  },
};

export const NoSignal: Story = {
  args: {
    rag: 'green',
    row: {
      entry: topic({ topic: 'orders:create', version: '', consumers: [{ service: 'orders-api', httpMappings: [] }] }),
      usageTotal: 148_320,
      evidence: [],
    },
  },
};

export const WithChanges: Story = {
  args: {
    row: {
      entry: topic({
        topic: 'payment:capture',
        changes: [{ kind: 'schema-changed', description: 'amount widened from integer to number' }],
      }),
      usageTotal: 0,
      evidence: ['no traffic observed while the usage feed is wired'],
    },
  },
};
