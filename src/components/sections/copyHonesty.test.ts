import { describe, it, expect } from 'vitest';
import * as copy from './compatibilityCopy';
import { buildRollouts } from '../../store/rollouts';
import rollout from '../../../contracts/artifacts/topics.rollout.json';
import type { TopicsTopicsItem, TopicsVersionCompatibilityItem } from '../../contracts';

/**
 * The honesty rules, executable.
 *
 * Three rounds of user testing found the same defect in different clothes: the product stating a
 * verdict it had not earned. Each fix was correct and each was a fix at one render site, so the
 * next surface reintroduced it. These assertions are the alternative — the rules are checked over
 * every string the feature can emit, so a new sentence that breaks one is a test failure rather
 * than a finding in the next round.
 */
const estate = rollout as unknown as {
  topics: TopicsTopicsItem[]; versionCompatibility: TopicsVersionCompatibilityItem[];
};
const rollouts = buildRollouts(estate.topics, estate.versionCompatibility);

/**
 * Every fixed string the compatibility/rollout surfaces can render.
 *
 * Exported functions are called with representative arguments rather than skipped: a sentence built
 * at render time is exactly as capable of over-claiming as a constant, and skipping them would leave
 * the most dynamic copy in the feature unchecked.
 *
 * ONE ENTRY PER BRANCH, not per function. `instanceCaveat` withdraws a hedge on one arm and keeps it
 * on another; auditing whichever arm happened to be listed would leave the interesting half — the
 * one that stops hedging — unchecked, which is the arm most able to over-claim.
 */
const CALLS: Record<string, unknown[][]> = {
  OUTSTANDING_EMPTY: [['billing-api']],
  notComparedSideCopy: [[['request', 'response'], 'v1']],
  instanceCaveat: [['shipping-api', null], ['shipping-api', 1], ['shipping-api', 4]],
  estateInstanceCaveat: [[null], [[]], [['shipping-api', 'billing-api']]],
};

const strings = (): string[] => {
  const out: string[] = [];
  for (const [name, value] of Object.entries(copy)) {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') {
      const calls = CALLS[name];
      // A new exported helper with no entry here is a gap in the audit, not something to skip past.
      expect(calls, `add ${name} to CALLS so its output is audited`).toBeDefined();
      for (const args of calls!) out.push((value as (...a: unknown[]) => string)(...args));
    } else if (value && typeof value === 'object') {
      out.push(...Object.values(value as Record<string, string>));
    }
  }
  return out;
};

/** Every string this feature GENERATES from live data, which fixed-string review cannot cover. */
const generated = (): string[] =>
  rollouts.flatMap((r) => [r.constraint, r.disjointNote, ...r.obligations.map((o) => o.verb)])
    .filter((s): s is string => typeof s === 'string');

const all = () => [...strings(), ...generated()];

describe('the product never claims safety', () => {
  it('never says safe, ready, clear, or fine', () => {
    // The product states which versions are covered and which are not. It does not certify a
    // release: it cannot see upcasters, dual-publishing, or anything outside the estate.
    for (const s of all()) {
      expect(s.toLowerCase()).not.toMatch(/\b(safe|ready to|clear to|it is fine|no risk)\b/);
    }
  });

  it('never uses a future tense', () => {
    // Mesh has no pipeline and no release train. The only tense available is the present indicative,
    // about declarations. "Will break" and "is scheduled" are both claims about a machine it cannot
    // see.
    for (const s of all()) {
      expect(s.toLowerCase()).not.toMatch(/\b(will |shall |scheduled|planned|upcoming|next release)\b/);
    }
  });

  it('never says "not started"', () => {
    // Unstarted and non-existent are the same picture to a contract aggregator: the catalogue holds
    // a (topic, version) only if some service declares it, so "declared by nobody" describes an
    // entry that cannot exist.
    for (const s of all()) expect(s.toLowerCase()).not.toContain('not started');
  });

  it('never orders the estate, only the two ends of one topic', () => {
    for (const s of all()) {
      expect(s.toLowerCase()).not.toMatch(/\b(must ship together|deploy first|in this order|step 1)\b/);
    }
  });
});

describe('the strong claim is rationed to the case that earns it', () => {
  it('never says messages are lost outside a disjoint version split', () => {
    // A producer declaring two versions may be dual-publishing every message on both, and the
    // catalogue cannot tell that from a split fleet whose new-version messages go unread.
    for (const r of rollouts) {
      const text = `${r.constraint ?? ''} ${r.disjointNote ?? ''}`.toLowerCase();
      if (!r.disjoint) {
        expect(text).not.toMatch(/\b(lost|dropped|nothing handles|cannot be read|unread)\b/);
      }
    }
  });

  it('names the dual-publish blind spot in the scope sentence', () => {
    expect(copy.ROLLOUT_SCOPE_CAVEAT).toContain('whether a producer emits both versions of every message');
  });

  it('says what the catalogue actually answers for', () => {
    expect(copy.POLLED_INSTANCE_CAVEAT).toContain('instance that answered the last poll');
  });
});

describe('the empty states name what was checked', () => {
  it('never draws a tick or reports a bare zero as good news', () => {
    for (const s of [copy.OUTSTANDING_EMPTY('billing-api'), copy.OUTSTANDING_SINGLE_VERSION]) {
      expect(s).toMatch(/every|one version/);
      expect(s).not.toMatch(/^(all good|healthy|✓|OK)/i);
    }
  });

  it('keeps the capability sentence distinct from the content sentence', () => {
    // "This tool did not look" and "there was nothing to find" lead to different actions.
    expect(copy.OUTSTANDING_NOT_PUBLISHED).not.toBe(copy.OUTSTANDING_SINGLE_VERSION);
    expect(copy.OUTSTANDING_NOT_PUBLISHED).toContain('unknown');
  });

  it('labels no rollout state with a reassuring word', () => {
    for (const label of Object.values(copy.ROLLOUT_STATE_LABEL)) {
      expect(label.toLowerCase()).not.toMatch(/\b(ok|good|fine|healthy|done|safe)\b/);
    }
  });
});
