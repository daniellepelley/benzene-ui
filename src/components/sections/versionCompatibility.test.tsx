import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VersionCompatibility } from './VersionCompatibility';
import { buildRollouts, type Rollout } from '../../store/rollouts';
import rollout from '../../../contracts/artifacts/topics.rollout.json';
import type { TopicsTopicsItem, TopicsVersionCompatibilityItem } from '../../contracts';

const estate = rollout as unknown as {
  topics: TopicsTopicsItem[]; versionCompatibility: TopicsVersionCompatibilityItem[];
};
const rollouts = buildRollouts(estate.topics, estate.versionCompatibility);
const forTopic = (topic: string) => ({
  compatibility: estate.versionCompatibility.find((v) => v.topic === topic)!,
  rollout: rollouts.find((r) => r.topic === topic) as Rollout,
});

const show = (topic: string) => {
  const { compatibility, rollout: r } = forTopic(topic);
  render(<VersionCompatibility compatibility={compatibility} rollout={r} />);
};

/**
 * One sentence was serving two structurally opposite situations. Both are "a version is produced
 * that nothing handles"; they need opposite advice, and getting it wrong sends a release manager to
 * the team that has already shipped.
 */
describe('the panel branches on WHICH version is unhandled', () => {
  it('tells a reader to check an upcaster when the NEWEST version is unhandled', () => {
    show('payment:capture');
    expect(screen.getByText(/Confirm an upcaster on the consumer bridges it/)).toBeTruthy();
  });

  it('says the move is producer-side when an OLDER version is unhandled', () => {
    // shipping-api dropped v1; orders-api still sends it. There is nobody at v1 to hold an upcaster.
    show('inventory:reserve');
    expect(screen.getByText(/the move is producer-side/)).toBeTruthy();
    expect(screen.queryByText(/Confirm an upcaster/)).toBeNull();
  });

  it('does not guess between a waiting rollout and a handler left behind', () => {
    show('invoice:raise');
    expect(screen.getByText(/Mesh cannot tell which/)).toBeTruthy();
  });

  it('names a versioned-out breaking change positively rather than leaving it bare', () => {
    show('shipping:book');
    expect(screen.getByText(/versioned out/)).toBeTruthy();
    expect(screen.getByText(/no deployment is coupled to it/)).toBeTruthy();
  });

  it('keeps the vacuous-reconciliation arm ahead of every other claim', () => {
    render(
      <VersionCompatibility
        compatibility={{
          topic: 'orders:create', producedVersions: [], consumedVersions: ['v1', 'v2'],
          producedNotConsumed: [], consumedNotProduced: [], isCompatible: true,
        } as unknown as TopicsVersionCompatibilityItem}
      />,
    );
    expect(screen.getByText(/nothing to reconcile/)).toBeTruthy();
  });
});

describe('the categorical claim is rationed to the one case that earns it', () => {
  it('makes it where the produced and consumed version sets are disjoint', () => {
    show('inventory:reserve');
    expect(screen.getByText(/do not overlap at all/)).toBeTruthy();
  });

  it('withholds it where a producer declaring two versions could be dual-publishing', () => {
    show('payment:capture');
    expect(screen.queryByText(/do not overlap at all/)).toBeNull();
  });
});

describe('the ordering constraint and the state chip', () => {
  it('states the order without stating a plan', () => {
    show('payment:capture');
    const text = screen.getByText(/must handle payment:capture v2 before/).textContent!;
    expect(text).toContain('orders-api already produces v2');
    for (const banned of ['safe', 'first', 'schedule', 'will be']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it('colours only an outstanding move, never a covered pair', () => {
    show('shipping:book');
    // Breaking, and fully versioned out. Colouring this is the cry-wolf the branch exists to remove.
    expect(screen.getByText('covered').getAttribute('data-state')).toBe('complete');
  });

  it('says what the catalogue actually answers for, on every rollout', () => {
    show('payment:capture');
    expect(screen.getByText(/instance that answered the last poll/)).toBeTruthy();
  });
});
