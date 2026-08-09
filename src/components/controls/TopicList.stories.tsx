import type { Meta, StoryObj } from '@storybook/react';
import { TopicList } from './TopicList';
import type { TopicsTopicsItem } from '../../contracts';

const t = (over: Partial<TopicsTopicsItem>): TopicsTopicsItem =>
  ({ topic: 'orders:create', version: '', reserved: false, consumers: [], producers: [], status: null, requestSchema: null, responseSchema: null, messageSchema: null, schemaMismatch: false, ...over }) as TopicsTopicsItem;

const meta = { title: 'Controls/TopicList', component: TopicList, args: { topics: [t({})], emptyMessage: 'No topics.' } } satisfies Meta<typeof TopicList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Empty: Story = { args: { topics: [] } };
export const Annotated: Story = {
  args: {
    topics: [
      t({ topic: 'orders:create', version: '2' }),
      t({ topic: 'benzene:mesh:descriptor', reserved: true }),
      t({ topic: 'order:legacy-export', status: 'deprecation-candidate' }),
      t({ topic: 'payments:settle', status: 'gap' }),
      t({ topic: 'shipping:book', schemaMismatch: true }),
    ],
  },
};
