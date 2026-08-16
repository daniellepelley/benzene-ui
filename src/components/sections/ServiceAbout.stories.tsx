import type { Meta, StoryObj } from '@storybook/react';
import { ServiceAbout, ServiceLiveness } from './ServiceAbout';
import { ServiceDrift } from './ServiceDrift';

const about = {
  description: 'Accepts and tracks customer orders through to fulfilment.',
  version: '2.4.0',
  fetchedAtUtc: '2026-08-09T05:58:11Z',
  drift: null,
};

const meta = {
  title: 'Sections/ServiceAbout',
  component: ServiceAbout,
  parameters: {
    docs: {
      description: {
        component:
          'What a service says about itself — the contract facts only. `Snapshot taken` and the '
          + 'heartbeat moved to `ServiceLiveness`: they are facts about when we last looked, not '
          + "about the service's shape, and sitting them next to the drift line was why readers took "
          + 'a release-blocking finding for a timestamp.',
      },
    },
  },
  args: { about },
} satisfies Meta<typeof ServiceAbout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

/** The fetch failed, so there is no self-description. The failure itself is reported by
 *  HealthChecks, where it explains the missing checks. */
export const FetchFailed: Story = {
  args: { about: { description: null, version: null, fetchedAtUtc: '2026-08-09T05:58:11Z', drift: null } },
};

/** A spec with no `info` block, or one that is not JSON at all. The rest still renders. */
export const NoSelfDescription: Story = {
  args: { about: { description: null, version: null, fetchedAtUtc: '2026-08-09T05:58:11Z', drift: null } },
};

export const NotLoaded: Story = { args: { about: null } };

/** The other half: when we last looked, and whether the service is still answering. */
export const Liveness: StoryObj<typeof ServiceLiveness> = {
  render: () => <ServiceLiveness about={about} liveness="live" />,
};

/** Declared healthy, observed silent — the divergence the two planes exist to expose. */
export const DeclaredHealthyButStale: StoryObj<typeof ServiceLiveness> = {
  render: () => <ServiceLiveness about={about} liveness="stale" />,
};

/** Never heartbeated is not a fault: most likely the reporting middleware simply is not wired. */
export const NeverHeartbeated: StoryObj<typeof ServiceLiveness> = {
  render: () => <ServiceLiveness about={about} liveness="silent" />,
};

/**
 * Drift with substance. This row used to read `spec hash changed: a91c4f0b… → 3d5e88b1…` and nothing
 * else — a detection rendered as a finding, which generates a message thread rather than a decision.
 */
export const ContractDrift: StoryObj<typeof ServiceDrift> = {
  render: () => (
    <ServiceDrift
      drift={{ previous: 'a91c4f0b2e77…', current: '3d5e88b1cc02…' }}
      changes={{ topics: 2, changes: 3, breaking: 1, warning: 1 }}
      onViewChanges={() => {}}
    />
  ),
};

/** The spec moved but no payload schema did — sayable in one sentence, and worth saying. */
export const DriftWithNoSchemaChange: StoryObj<typeof ServiceDrift> = {
  render: () => (
    <ServiceDrift
      drift={{ previous: 'a91c4f0b2e77…', current: '3d5e88b1cc02…' }}
      changes={{ topics: 0, changes: 0, breaking: 0, warning: 0 }}
      onViewChanges={() => {}}
    />
  ),
};
