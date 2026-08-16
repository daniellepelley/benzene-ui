import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ServiceOutstanding } from './ServiceOutstanding';
import { buildRollouts } from '../../store/rollouts';
import rollout from '../../../contracts/artifacts/topics.rollout.json';
import type { TopicsTopicsItem, TopicsVersionCompatibilityItem } from '../../contracts';

const estate = rollout as unknown as {
  topics: TopicsTopicsItem[]; versionCompatibility: TopicsVersionCompatibilityItem[];
};
const obligationsFor = (service: string) =>
  buildRollouts(estate.topics, estate.versionCompatibility)
    .flatMap((r) => r.obligations)
    .filter((o) => o.service === service);

const show = (service: string, over: Partial<Parameters<typeof ServiceOutstanding>[0]> = {}) =>
  render(
    <ServiceOutstanding
      service={service}
      obligations={obligationsFor(service)}
      published
      hasVersionPairs
      onOpenTopic={() => {}}
      {...over}
    />,
  );

/**
 * The developer's first click. `billing-api` is the single remaining blocker of a three-service
 * chain and its page said, in full, `CONSUMES order:placed v1 / PRODUCES invoice:raise v1` — no
 * badge, no amber, nothing — because every contract mark in the product attached to whoever had
 * already declared the new version.
 */
describe('what this release requires of one service', () => {
  it('shows the blocker both of its moves, in the two different roles', () => {
    show('billing-api');

    expect(screen.getByText('2 contract moves')).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    const placed = rows.find((li) => li.textContent?.includes('order:placed'))!;
    const raise = rows.find((li) => li.textContent?.includes('invoice:raise'))!;
    // Read the topic, and it is not readable which of these is which: one is a handler that must
    // catch up, the other a producer that must finish. The verb is the row's whole point.
    expect(within(placed).getByText('handle v2')).toBeTruthy();
    expect(within(raise).getByText('produce v2')).toBeTruthy();
  });

  it('keeps the two obligations separate rather than rolling them into a count', () => {
    show('billing-api');
    // The one that gets missed is always the second one on a service already ticked off.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  /**
   * An obligation is not a function of the verdict. `invoice:raise` v2 adds a required field to an
   * event, which genuinely does not break a reader still on v1 — and billing-api still owes the
   * deploy. If obligation were derived from severity this row would not exist.
   */
  it('lists a compatible change that still owes a deploy', () => {
    show('billing-api');
    const raise = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('invoice:raise'))!;
    expect(raise.textContent).toContain('compatible');
  });

  it('distinguishes a gap that exists now from a rollout merely unfinished', () => {
    show('billing-api');
    const rows = screen.getAllByRole('listitem');
    expect(rows.find((li) => li.textContent?.includes('order:placed'))!.dataset.kind).toBe('catchUp');
    expect(rows.find((li) => li.textContent?.includes('invoice:raise'))!.dataset.kind).toBe('completion');
  });

  it('names the caller, not the handler, when the consumer moved first', () => {
    // shipping-api dropped v1 of inventory:reserve; orders-api still sends it. A tool that reads
    // "a version with no handler" and blames the consumers sends a release manager to the team that
    // has already shipped.
    const orders = obligationsFor('orders-api');
    expect(orders.map((o) => `${o.topic} ${o.verb}`)).toEqual(['inventory:reserve send v2']);
    expect(obligationsFor('shipping-api')).toEqual([]);
  });

  it('owes nothing on a breaking change that has been versioned out', () => {
    // shipping:book v2 removes a required field from an event and every party declares both
    // versions, so it appears on nobody's list however red its diff is.
    for (const service of ['orders-api', 'payments-api', 'shipping-api']) {
      expect(obligationsFor(service).some((o) => o.topic === 'shipping:book')).toBe(false);
    }
  });
});

/** Three sentences, because they lead to three different actions. */
describe('the empty states', () => {
  it('claims only what it checked, and not that the service is healthy', () => {
    show('ledger-api', { obligations: [] });
    expect(screen.getByText(/No contract move is outstanding on ledger-api/)).toBeTruthy();
    expect(screen.getByText(/not about whether every topic it touches is healthy/)).toBeTruthy();
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('says the tool never looked when the aggregator publishes no comparisons', () => {
    show('ledger-api', { obligations: [], published: false });
    expect(screen.getByText(/does not publish contract comparisons/)).toBeTruthy();
  });

  it('says there is nothing to roll out when nothing has a second version', () => {
    show('ledger-api', { obligations: [], hasVersionPairs: false });
    expect(screen.getByText(/one version of every topic/)).toBeTruthy();
  });

  it('lets the capability statement outrank the content statement', () => {
    // Both arms true at once: an aggregator that publishes nothing cannot be quoted on whether the
    // estate has version pairs, so "not published" wins.
    show('ledger-api', { obligations: [], published: false, hasVersionPairs: false });
    expect(screen.getByText(/does not publish contract comparisons/)).toBeTruthy();
  });
});

/**
 * Two findings from the same service owner, one round apart. The first version of this block named
 * neither the counterpart nor the fact that the old version has to stay live — so the sentence a
 * service owner would actually paste into Slack lived on a different screen, and `handle v2` read as
 * `swap to v2` on a topic whose producer was still emitting v1.
 */
describe('the row answers "who is blocked on me" and "what do I keep alive"', () => {
  it('names the counterpart rather than saying "the other side"', () => {
    show('billing-api');
    const placed = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('order:placed'))!;
    expect(placed.textContent).toContain('orders-api has already moved');
    expect(placed.textContent).toContain('cannot retire v1 until this ships');
  });

  it('says the baseline must stay live while the other side is still on it', () => {
    show('billing-api');
    const placed = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('order:placed'))!;
    // orders-api produces v1 AND v2, so a v2-only handler here kills the live path on deploy.
    expect(placed.textContent).toContain('keep v1 live');
  });

  it('does not say it on a completion, which has nobody left to strand', () => {
    show('billing-api');
    const raise = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('invoice:raise'))!;
    expect(raise.textContent).not.toContain('keep v1 live');
    expect(raise.textContent).toContain('ledger-api is already reading v2');
  });

  it('does not say it where the other side has already left the baseline', () => {
    // shipping-api dropped inventory:reserve v1 entirely; there is no live v1 path to protect.
    const orders = obligationsFor('orders-api');
    expect(orders[0]!.alongsideBaseline).toBe(false);
  });
});

/**
 * The empty state used to read "every version this service declares is covered on both sides of
 * every topic it touches". On `shipping-api` — which owes nothing precisely because it moved first
 * and moved correctly, and is the one UNHEALTHY service in the estate — that sentence sat above a
 * version nothing in the estate produces and a live 2,205-error issue card. Every fact needed to
 * falsify it was on the same screen. A badge that over-claims is a hint; a sentence that
 * over-claims is a claim.
 */
describe('a service that owes nothing is not thereby declared healthy', () => {
  const awaitingFor = (service: string) =>
    buildRollouts(estate.topics, estate.versionCompatibility).filter((r) =>
      r.outstanding.length > 0 && !r.outstanding.includes(service) && r.moved.includes(service));

  it('says what is owed TO the service that has already moved', () => {
    show('shipping-api', { obligations: [], awaiting: awaitingFor('shipping-api') });

    expect(screen.getByText(/No contract move is outstanding on shipping-api/)).toBeTruthy();
    const row = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('inventory:reserve'))!;
    expect(row.textContent).toContain('orders-api');
    // And it is not merely pending — shipping-api dropped v1, so the calls are failing now.
    expect(row.textContent).toContain('the gap is live now');
  });

  it('does not claim coverage the catalogue contradicts', () => {
    show('shipping-api', { obligations: [], awaiting: awaitingFor('shipping-api') });
    expect(screen.queryByText(/covered on both sides/)).toBeNull();
  });

  it('says nothing extra for a service that is genuinely waiting on nobody', () => {
    show('ledger-api', { obligations: [], awaiting: [] });
    expect(screen.queryByText(/Waiting on/)).toBeNull();
  });
});

/**
 * A CAVEAT ADDED FOR HONESTY WAS BLOCKING ACTION.
 *
 * `POLLED_INSTANCE_CAVEAT` is true and it turns every OWES/MOVED verdict on the product's best
 * surface into a maybe: a platform engineer reading MOVED could not tell whether it meant "this
 * service has moved" or "one of its four instances has". `FleetViewServicesItem.instances` answers
 * exactly that and had never been read.
 *
 * The rule is symmetric with the third state elsewhere: state the measurement with its scope, or
 * state that it was not measured — and stop hedging where there is nothing to hedge about.
 */
describe('the polled-instance caveat is quantified, and withdrawn where it does not apply', () => {
  it('is withdrawn outright on a service running one instance', () => {
    show('billing-api', { instances: 1 });
    expect(screen.getByText(/billing-api runs a single instance, so this is the whole truth/)).toBeTruthy();
    expect(screen.queryByText(/instances of the same service can legitimately disagree/)).toBeNull();
  });

  it('is quantified, not resolved, on a service running several', () => {
    // Never "1 of 4 have moved": the collector counts instances and the aggregator polls one of
    // them, and nothing anywhere joins those two facts. Saying four is honest; saying which is not.
    show('billing-api', { instances: 4 });
    expect(screen.getByText(/collector has seen 4 instances of billing-api/)).toBeTruthy();
    expect(screen.queryByText(/1 of 4/)).toBeNull();
  });

  it('keeps the unqualified caveat when the plane cannot say', () => {
    // No collector, or no row for this service. Unknown is not one instance, and a withdrawal built
    // on an absent count would be the absence-as-good-news defect on the product's sharpest claim.
    show('billing-api', { instances: null });
    expect(screen.getByText(/instances of the same service can legitimately disagree/)).toBeTruthy();
  });
});
