import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadManifest } from './slices/estateSlice';
import { loadCatalog } from './slices/catalogSlice';
import { fleetObserved, clockTicked } from './slices/fleetSlice';
import { fleetView, fleetService } from '../test/fleetView';
import { fakeMeshApi } from '../test/fakeMeshApi';
import {
  selectMissingFeedsForService, selectObservedHealth, selectNeverHeartbeated,
  selectUndeclaredServices, selectDivergences, selectUsageWindow,
} from './selectors';

/**
 * THE THIRD STATE IS NOT OPTIONAL AT ANY GRAIN.
 *
 * Every figure in this product resolves to exactly one of: measured with its window stated, measured
 * as zero, or not measured — and a surface may never render the third as either of the first two.
 * The rule already applied to an unreadable ARTIFACT (`feedErrors`, `— NOT COMPUTED`). Round 7 found
 * it was not applied to an absent FIELD or a declared-missing FEED, which is the same rule at two
 * finer grains.
 *
 * Six persona reports turned out to be one defect, stated by the product owner as: *the product
 * repeatedly fetches a discriminating fact and renders an undiscriminating one*. These are the
 * discriminating facts, driven from the wire, asserting that each one survives to the store.
 *
 * This is the wave's gate, in the `copyHonesty.test.ts` and C1.6 tradition: the rule is executable,
 * so the next surface cannot quietly reintroduce the defect.
 */
const ready = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};

const T0 = Date.parse('2026-08-09T06:00:00Z');
const at = (msAgo: number) => new Date(T0 - msAgo).toISOString();

describe('a feed the collector says it does not have', () => {
  it('is carried through as a declared absence, per service', async () => {
    // A service whose collector declared `["health","usage"]` rendered "Heartbeat healthy",
    // "9.8k messages observed" and "● No issues observed for this service" — three positive
    // assertions built on feeds the plane had just said it does not have.
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api', missingFeeds: ['health', 'usage'] })],
    })));

    expect(selectMissingFeedsForService(store.getState(), 'orders-api')).toEqual(['health', 'usage']);
  });

  it('says nothing about a service the plane made no claim about', async () => {
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({ services: [fleetService({ service: 'orders-api' })] })));
    expect(selectMissingFeedsForService(store.getState(), 'orders-api')).toEqual([]);
  });

  it('claims nothing at all when no collector is wired', async () => {
    // No plane means no declaration either way — not "nothing is missing".
    const store = await ready();
    expect(selectMissingFeedsForService(store.getState(), 'orders-api')).toEqual([]);
  });
});

describe('the live plane’s own health verdict', () => {
  it('survives to the store, where it used to be dropped entirely', async () => {
    // `health: "unreachable"` rendered HEALTHY, from a manifest snapshot hours older than the
    // contradiction it was overriding.
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api', health: 'unreachable' })],
    })));

    expect(selectObservedHealth(store.getState(), 'orders-api')).toBe('unreachable');
  });

  it('is null rather than a guess when the plane does not say', async () => {
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api', health: '' })],
    })));
    expect(selectObservedHealth(store.getState(), 'orders-api')).toBeNull();
  });
});

describe('never heard from is not the same as went quiet', () => {
  it('separates a service that never heartbeated from one that went stale', async () => {
    // The banner tested for `stale` and used the word `silent`, so an estate with two
    // never-heartbeated services named the one that had merely gone quiet.
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      generatedAt: new Date(T0).toISOString(),
      services: [
        // `orders-api` is the one service the manifest declares healthy, so it is the only one that
        // CAN diverge — a divergence is "told me it was fine, then went quiet".
        fleetService({ service: 'orders-api', lastSeen: at(60 * 60_000) }),
        fleetService({ service: 'payments-api', lastSeen: at(30_000) }),
        fleetService({ service: 'shipping-api' }),
      ],
    })));
    store.dispatch(clockTicked(T0));

    // `shipping-api` has never spoken; `orders-api` spoke and stopped. Different problems, different
    // fixes, and the product now reports them apart — under their right names.
    expect(selectNeverHeartbeated(store.getState())).toEqual(['shipping-api']);
    expect(selectDivergences(store.getState())).toEqual(['orders-api']);
  });
});

describe('a service the collector sees and the catalogue does not', () => {
  it('is named rather than dropped', async () => {
    // mesh.md §4.2's *undeclared* case at service grain: live, sending, never catalogued. It was
    // dropped silently, which made it the third distinct cause of "why isn't my service showing up"
    // and the only one with no diagnosis anywhere in the product.
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api' }), fleetService({ service: 'promo-api' })],
    })));

    expect(selectUndeclaredServices(store.getState())).toEqual(['promo-api']);
  });
});

describe('a count without a period is not a measurement', () => {
  it('reads the window the usage feed states', async () => {
    const store = await ready();
    expect(selectUsageWindow(store.getState())).toEqual({
      from: '2026-07-15T09:15:00Z',
      to: '2026-07-16T09:15:00Z',
    });
  });

  it('stays null rather than guessing when the feed does not state one', async () => {
    // A delivery owner derived the period from a call rate and was out by a factor of twelve. The
    // honest answer to "what window is this" is sometimes "the feed does not say".
    const store = await ready({
      getUsage: async () => ({ generatedAtUtc: '2026-08-09T06:00:00Z', entries: [] } as never),
    });
    expect(selectUsageWindow(store.getState())).toBeNull();
  });
});

/**
 * With the live plane down, `0 DEGRADED / 0 UNREACHABLE` rendered directly beneath a banner saying
 * the plane could not be reached — claims about reachability made by a UI that had just admitted it
 * cannot measure reachability. The tile one place to the right already knew how to say
 * `— NOT COMPUTED`; these three did not.
 */
describe('health counts a UI cannot measure are not asserted as zero', () => {
  const renderEstate = async (over = {}) => {
    const store = await ready(over);
    const { render } = await import('@testing-library/react');
    const { Provider } = await import('react-redux');
    const { FleetPage } = await import('../components/pages/FleetPage');
    render(<Provider store={store}><FleetPage /></Provider>);
    return store;
  };

  /**
   * "Unreachable" is a stat-tile label AND the word the estate list uses for a service in that
   * state, so a bare `getByText` matches two unrelated nodes and fails for a reason that has nothing
   * to do with the rule under test. Scope to the tile.
   */
  const statTile = (label: string, screen: { getAllByText: (t: string) => HTMLElement[] }) => {
    const tile = screen.getAllByText(label)
      .map((node) => node.closest('.bz-stat'))
      .find((node): node is HTMLElement => node != null);
    if (tile == null) throw new Error(`no stat tile labelled "${label}"`);
    return tile;
  };

  it('says not computed when the plane is wired and not answering', async () => {
    const { screen } = await import('@testing-library/react');
    const { probeFleet } = await import('./slices/fleetSlice');
    const store = await ready({ getFleet: async () => { throw new Error('ECONNREFUSED'); } });
    // The slice stamps a failure with the LAST TICKED CLOCK rather than `Date.now()` — a selector or
    // reducer that reads the wall clock is neither testable nor memoisable. Without a tick there is
    // no `lastFailAt` at all, and "wired but not answering" is indistinguishable from "never wired",
    // which is right of the slice and merely a setup step here.
    store.dispatch(clockTicked(T0));
    await store.dispatch(probeFleet());

    const { render } = await import('@testing-library/react');
    const { Provider } = await import('react-redux');
    const { FleetPage } = await import('../components/pages/FleetPage');
    render(<Provider store={store}><FleetPage /></Provider>);

    const tile = statTile('Unreachable', screen);
    expect(tile.textContent).toContain('—');
    expect(tile.textContent).toContain('not computed');
  });

  it('still counts normally when no collector is wired at all', async () => {
    // No plane is not a gap in knowledge — the manifest is a perfectly good source for declared
    // status, and degrading it would make the product useless the moment a collector is unwired.
    const { screen } = await import('@testing-library/react');
    await renderEstate();
    const tile = statTile('Unreachable', screen);
    expect(tile.textContent).not.toContain('not computed');
  });
});
