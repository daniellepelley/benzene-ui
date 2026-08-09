import type { Meta, StoryObj } from '@storybook/react';
import { ServiceLinks } from './ServiceLinks';

const meta = {
  title: 'Controls/ServiceLinks',
  component: ServiceLinks,
  parameters: {
    docs: {
      description: {
        component:
          'The ways out of a service card. `raw` and `health` come from a self-reported manifest, so ' +
          'callers pass them through `safeHttpUrl` first — a `javascript:` href would execute on click, ' +
          'and `target="_blank"` does not stop it.',
      },
    },
  },
  args: {
    specViewHref: 'mesh-spec-ui.html?service=orders-api',
    rawSpecHref: 'https://orders-api.example/benzene/spec',
    healthHref: 'https://orders-api.example/healthcheck',
  },
} satisfies Meta<typeof ServiceLinks>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllThree: Story = {};

/** A manifest entry with no self-reported URLs. The mesh's own spec view still works. */
export const SpecViewOnly: Story = { args: { rawSpecHref: null, healthHref: null } };

/** A hostile or malformed URL was refused upstream, so its link simply is not offered. */
export const UnsafeUrlsRefused: Story = {
  args: { rawSpecHref: null, healthHref: 'https://orders-api.example/healthcheck' },
};

export const Nothing: Story = { args: { specViewHref: null, rawSpecHref: null, healthHref: null } };
