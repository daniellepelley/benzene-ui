import type { Meta, StoryObj } from '@storybook/react';
import { ServiceAbout } from './ServiceAbout';

const meta = {
  title: 'Sections/ServiceAbout',
  component: ServiceAbout,
  parameters: {
    docs: {
      description: {
        component:
          'The service\'s own words, plus the two health planes side by side: what it says when asked, ' +
          'and whether it is still saying anything at all.',
      },
    },
  },
  args: {
    about: {
      description: 'Accepts and tracks customer orders through to fulfilment.',
      version: '2.4.0',
      fetchedAtUtc: '2026-08-09T05:58:11Z',
      drift: null,
    },
    liveness: 'live',
  },
} satisfies Meta<typeof ServiceAbout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

/** Declared healthy, observed silent — the divergence the two planes exist to expose. */
export const DeclaredHealthyButStale: Story = { args: { liveness: 'stale' } };

/** Never heartbeated is not a fault: most likely the reporting middleware simply is not wired. */
export const NeverHeartbeated: Story = { args: { liveness: 'silent' } };

export const ContractDrift: Story = {
  args: {
    about: {
      description: 'Captures payments against authorised orders.',
      version: '1.9.2',
      fetchedAtUtc: '2026-08-09T05:58:11Z',
      drift: { previous: 'a91c4f0b2e77…', current: '3d5e88b1cc02…' },
    },
  },
};

/** The fetch failed, so there is no self-description — only when we last tried. The failure itself
 *  is reported by HealthChecks, where it explains the missing checks. */
export const FetchFailed: Story = {
  args: {
    about: { description: null, version: null, fetchedAtUtc: '2026-08-09T05:58:11Z', drift: null },
    liveness: null,
  },
};

/** A spec with no `info` block, or one that is not JSON at all. The rest still renders. */
export const NoSelfDescription: Story = {
  args: {
    about: { description: null, version: null, fetchedAtUtc: '2026-08-09T05:58:11Z', drift: null },
    liveness: null,
  },
};

export const NotLoaded: Story = { args: { about: null } };
