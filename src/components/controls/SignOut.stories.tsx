import type { Meta, StoryObj } from '@storybook/react';
import { SignOut } from './SignOut';

const meta = {
  title: 'Controls/SignOut',
  component: SignOut,
  parameters: {
    docs: {
      description: {
        component:
          'Ends the session, when the page is served behind a login gate. A POST behind the ' +
          '`X-Benzene-Logout` CSRF header, not a plain link — the server refuses a GET on purpose. ' +
          'A federated deployment answers with the identity provider\'s own end-session redirect; ' +
          'otherwise the page reloads. The request can fail like any other write, and shows an ' +
          'inline note when it does. With no logout URL it renders nothing at all: a greyed-out ' +
          '"Sign out" on a mesh with no sessions claims the deployment has authentication and that ' +
          'it is broken, and neither is true.',
      },
    },
  },
  args: { available: true, onSignOut: () => {} },
} satisfies Meta<typeof SignOut>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

/** The ordinary local and static-hosting case: no auth, so no control. */
export const NoAuthConfigured: Story = { args: { available: false } };

/** The request failed — an expired session, a network blip, the host briefly down. */
export const Failed: Story = { args: { note: '401 Unauthorized' } };
