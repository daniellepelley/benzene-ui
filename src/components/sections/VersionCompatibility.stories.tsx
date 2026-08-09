import type { Meta, StoryObj } from '@storybook/react';
import { VersionCompatibility } from './VersionCompatibility';

const meta = {
  title: 'Sections/VersionCompatibility',
  component: VersionCompatibility,
  parameters: {
    docs: {
      description: {
        component:
          'A version produced that nothing consumes is a prompt to confirm an upcaster exists, not a ' +
          'proven break — the mesh cannot see upcasters, and the copy has to admit that.',
      },
    },
  },
  args: {
    compatibility: {
      topic: 'payment:capture',
      producedVersions: ['v1', 'v2'],
      consumedVersions: ['v1'],
      producedNotConsumed: ['v2'],
      consumedNotProduced: [],
      isCompatible: false,
    },
  },
} satisfies Meta<typeof VersionCompatibility>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ForwardCompatibilityRisk: Story = {};

export const Compatible: Story = {
  args: {
    compatibility: {
      topic: 'orders:create',
      producedVersions: ['v1', 'v2'],
      consumedVersions: ['v1', 'v2'],
      producedNotConsumed: [],
      consumedNotProduced: [],
      isCompatible: true,
    },
  },
};

/** A handler for a version nothing emits any more — a retiring version, or a handler left behind. */
export const StaleHandler: Story = {
  args: {
    compatibility: {
      topic: 'shipping:book',
      producedVersions: ['v2'],
      consumedVersions: ['v1', 'v2'],
      producedNotConsumed: [],
      consumedNotProduced: ['v1'],
      isCompatible: true,
    },
  },
};

/** An unversioned producer alongside a versioned one. Empty string is a real version value here. */
export const Unversioned: Story = {
  args: {
    compatibility: {
      topic: 'order:legacy-export',
      producedVersions: ['', 'v1'],
      consumedVersions: ['v1'],
      producedNotConsumed: [''],
      consumedNotProduced: [],
      isCompatible: false,
    },
  },
};

/** Nothing to reconcile — the aggregator emitted no entry, so the section is absent entirely. */
export const NoEntry: Story = { args: { compatibility: null } };
