import type { Meta, StoryObj } from '@storybook/react';
import { MessageComposer } from './MessageComposer';
import type { TopicsTopicsItem } from '../../contracts';

const v = (over: Partial<TopicsTopicsItem>): TopicsTopicsItem =>
  ({ topic: 'orders:create', version: '', reserved: false, consumers: [], producers: [], status: null,
     requestSchema: { type: 'object', properties: { orderId: { type: 'string', format: 'uuid' }, amount: { type: 'number', minimum: 0 } }, required: ['orderId'] },
     responseSchema: null, messageSchema: null, schemaMismatch: false, ...over }) as TopicsTopicsItem;

const meta = {
  title: 'Sections/MessageComposer',
  component: MessageComposer,
  parameters: { docs: { description: { component: 'Compose a message against a topic and send it — the mesh equivalent of "try it out". The body is seeded deterministically from the topic schema, and every field lives in the store so switching away and back keeps the draft.' } } },
  args: {
    versions: [v({})],
    versionIndex: 0,
    transports: ['raw', 'http'],
    transport: 'raw',
    headersJson: '{}',
    bodyJson: '{\n  "orderId": "00000000-0000-0000-0000-000000000000",\n  "amount": 0\n}',
    bodyValid: true, headersValid: true, canSend: true, send: 'idle', error: null, result: null,
    onVersion: () => {}, onTransport: () => {}, onBody: () => {}, onHeaders: () => {}, onSend: () => {},
  },
} satisfies Meta<typeof MessageComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const MultipleVersions: Story = { args: { versions: [v({ version: '' }), v({ version: '2' }), v({ version: '3', requestSchema: null, messageSchema: null })] } };
export const InvalidBody: Story = { args: { bodyJson: '{ not json', bodyValid: false, canSend: false } };
export const InvalidHeaders: Story = { args: { headersJson: 'nope', headersValid: false, canSend: false } };
export const Sending: Story = { args: { send: 'sending', canSend: false } };
export const Succeeded: Story = { args: { send: 'sent', result: { statusCode: 'created', body: '{"id":"9f2"}', headers: {} } } };
export const Failed: Story = { args: { send: 'failed', result: { statusCode: 'bad-request', body: '{"errors":["orderId is required"]}', headers: {} } } };
export const ReadOnlyMesh: Story = { args: { onSend: undefined } };
export const NoComposableVersion: Story = { args: { versions: [] } };
