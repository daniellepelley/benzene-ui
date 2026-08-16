import type { Meta, StoryObj } from '@storybook/react';
import { RefreshButton } from './RefreshButton';

const meta = {
  title: 'Controls/RefreshButton',
  component: RefreshButton,
  parameters: {
    docs: {
      description: {
        component:
          'Asks the mesh to run a discovery pass now rather than at its next scheduled one. Absent ' +
          '— not disabled — when the deployment wired no refresh endpoint, because a control that ' +
          'cannot work is a claim about the mesh that is not true. Disabled while a pass is in ' +
          'flight: the server rate-limits refreshes anyway, and letting a reader queue ten clicks ' +
          'and then meet a wall of "refreshed recently" is the client being rude first.',
      },
    },
  },
  args: { available: true, state: 'idle', onRefresh: () => {} },
} satisfies Meta<typeof RefreshButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

/** A pass is running. One click at a time, whatever the mouse does. */
export const InFlight: Story = { args: { state: 'refreshing' } };

/** The server's rate limit, working. Deliberately not red: nothing is wrong, it is simply not yet. */
export const Throttled: Story = {
  args: { state: 'throttled', note: 'Refreshed recently — try again shortly.' },
};

/** Behind a login gate, sessions run out. Retrying cannot help; signing in again can. */
export const SessionExpired: Story = {
  args: { state: 'expired', note: 'Your session has expired — reload the page to sign in again.' },
};

/** Anything else, in the mesh's own words rather than a shrug. */
export const Failed: Story = {
  args: { state: 'failed', note: '503 Service Unavailable for /benzene/mesh/refresh' },
};

/** No refresh endpoint configured. The story is deliberately empty — that is the whole behaviour. */
export const NotConfigured: Story = { args: { available: false } };
