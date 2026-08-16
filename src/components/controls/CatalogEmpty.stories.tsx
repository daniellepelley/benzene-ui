import type { Meta, StoryObj } from '@storybook/react';
import { CatalogEmpty } from './CatalogEmpty';

const meta = {
  title: 'Controls/CatalogEmpty',
  component: CatalogEmpty,
  parameters: {
    docs: {
      description: {
        component:
          'The first minute of a deployment. A mesh that has just been stood up has run no ' +
          'discovery pass, so there is no manifest.json and the artifact store answers 404 — which ' +
          'the page used to render as "404 Not Found for manifest.json", so the first thing the ' +
          'owner of a new mesh ever saw was a failure about a filename. This says what is true and ' +
          'what happens next, and when the mesh can be asked for a pass on demand it makes the ask ' +
          'the page\'s only control.',
      },
    },
  },
  args: { canRefresh: true, refresh: 'idle', onRefresh: () => {} },
} satisfies Meta<typeof CatalogEmpty>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing published yet, and one click out of it. */
export const WithRefresh: Story = {};

/** The pass the reader asked for is running. */
export const RefreshInFlight: Story = { args: { refresh: 'refreshing' } };

/** Someone already asked, moments ago. Not an error — the server is pacing the passes. */
export const RefreshThrottled: Story = {
  args: { refresh: 'throttled', refreshNote: 'Refreshed recently — try again shortly.' },
};

/** No refresh endpoint: name the thing being waited for rather than offer a button that does nothing. */
export const ScheduledOnly: Story = { args: { canRefresh: false } };
