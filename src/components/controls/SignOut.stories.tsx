import type { Meta, StoryObj } from '@storybook/react';
import { SignOut } from './SignOut';

const meta = {
  title: 'Controls/SignOut',
  component: SignOut,
  parameters: {
    docs: {
      description: {
        component:
          'Ends the session, when the page is served behind a login gate. An anchor rather than a ' +
          'button because the host\'s logout endpoint answers with a redirect — there is nothing ' +
          'to await and nothing that can fail. With no logout URL it renders nothing at all: a ' +
          'greyed-out "Sign out" on a mesh with no sessions claims the deployment has ' +
          'authentication and that it is broken, and neither is true.',
      },
    },
  },
  args: { url: '/benzene/auth/logout' },
} satisfies Meta<typeof SignOut>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

/** The ordinary local and static-hosting case: no auth, so no control. */
export const NoAuthConfigured: Story = { args: { url: null } };
