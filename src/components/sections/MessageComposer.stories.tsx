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
    confirmed: true,
    onVersion: () => {}, onTransport: () => {}, onBody: () => {}, onHeaders: () => {}, onSend: () => {},
    onConfirmToggle: () => {},
  },
} satisfies Meta<typeof MessageComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Unconfirmed: Story = { args: { confirmed: false, canSend: false } };
export const MultipleVersions: Story = { args: { versions: [v({ version: '' }), v({ version: '2' }), v({ version: '3', requestSchema: null, messageSchema: null })] } };
export const InvalidBody: Story = { args: { bodyJson: '{ not json', bodyValid: false, canSend: false } };
export const InvalidHeaders: Story = { args: { headersJson: 'nope', headersValid: false, canSend: false } };
export const Sending: Story = { args: { send: 'sending', canSend: false } };
export const Succeeded: Story = { args: { send: 'sent', result: { statusCode: 'created', isSuccessful: true, body: '{"id":"9f2"}', headers: {} } } };
/**
 * A send that reached the target and failed. Its body is the problem document (wire-contracts §1.3),
 * so the console lays out each error's field, code and message, beside what the body held there.
 */
export const ValidationError: Story = {
  args: {
    send: 'sent',
    bodyJson: '{\n  "quantity": 0\n}',
    result: {
      statusCode: 'validation-error', isSuccessful: false, headers: { 'content-type': 'application/problem+json' },
      body: JSON.stringify({
        type: 'https://benzene.app/problems/validation-error', title: 'Validation failed',
        detail: 'orderId is required, quantity must be greater than 0', benzeneStatus: 'validation-error',
        errors: [
          { message: 'orderId is required', field: '/orderId', code: 'required' },
          { message: 'quantity must be greater than 0', field: '/quantity', code: 'GreaterThanValidator' },
        ],
      }),
    },
    problem: {
      benzeneStatus: 'validation-error', title: 'Validation failed',
      detail: 'orderId is required, quantity must be greater than 0',
      rows: [
        { message: 'orderId is required', field: '/orderId', code: 'required', sent: 'absent' },
        { message: 'quantity must be greater than 0', field: '/quantity', code: 'GreaterThanValidator', sent: '0' },
      ],
    },
  },
};
/**
 * A failure from a route-mapped HTTP endpoint (wire-contracts §4.1): the status is the problem
 * document's `benzeneStatus`, an application-defined one included, not the reverse HTTP table's.
 */
export const HttpRouteProblem: Story = {
  args: {
    send: 'sent',
    result: {
      statusCode: 'order-locked', isSuccessful: false, headers: {},
      body: JSON.stringify({ status: 409, benzeneStatus: 'order-locked', detail: 'Order o-17 is locked for picking' }),
    },
    problem: { benzeneStatus: 'order-locked', detail: 'Order o-17 is locked for picking', rows: [] },
  },
};
/** The send never reached a result: the reason is the error line, and there is no response. */
export const Failed: Story = { args: { send: 'failed', error: 'Timed out reaching the target service.', result: null } };
/** An application-defined status the service itself calls a success — green from `isSuccessful`, not from the word. */
export const ApplicationStatus: Story = { args: { send: 'sent', result: { statusCode: 'queued-for-review', isSuccessful: true, body: '{}', headers: {} } } };
/** A response with no `isSuccessful`: amber, and said so, rather than guessed from the status text. */
export const Unclassified: Story = { args: { send: 'sent', result: { statusCode: 'ok', body: '{}', headers: {} } } };
/** No envelope came back, only an HTTP status: the carrier failed before any handler ran. */
export const CarrierFailure: Story = { args: { send: 'sent', result: { statusCode: '401', isSuccessful: false, httpStatus: 401, body: 'Unauthorized', headers: {} } } };
export const Blocked: Story = { args: { send: 'blocked', error: 'Mesh dispatch is disabled in this environment. It invokes a service\'s real handler with the supplied payload (real side-effects execute), so it is off in Production unless MeshDispatchOptions.AllowInProduction is explicitly set.', canSend: false } };
export const ReadOnlyMesh: Story = { args: { onSend: undefined } };
export const NoComposableVersion: Story = { args: { versions: [] } };
