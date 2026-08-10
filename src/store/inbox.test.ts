import { describe, it, expect, vi } from 'vitest';
import { createStore } from './store';
import { probeFleet, pollInbox, clockTicked, fleetObserved, INBOX_WINDOW } from './slices/fleetSlice';
import { rangeChanged } from './slices/viewSlice';
import { selectInboxIssues, selectIssueSummary } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';
import type { FleetQuery } from './slices/fleetSlice';
import { fleetView, meshIssue } from '../test/fleetView';

const NOW = Date.parse('2026-08-09T09:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

const overnight = meshIssue({ fingerprint: 'overnight', lastSeen: ago(6), count: 412 });
const recent = meshIssue({ fingerprint: 'recent', lastSeen: ago(0.2), count: 3 });
const lastWeek = meshIssue({ fingerprint: 'last-week', lastSeen: ago(24 * 7), count: 9000 });

describe('the issue inbox', () => {
  it('asks over a fixed 24 hours, whatever window the reader picked', async () => {
    // An overnight failure has to greet the morning check. Tying the inbox to a 15-minute picker
    // makes the thing that broke at 3am invisible at 9am — the one moment it most needs to be seen.
    const getFleet = vi.fn(async (_query: FleetQuery) => fleetView());
    const store = createStore(fakeMeshApi({ getFleet }));

    store.dispatch(rangeChanged(15 * 60_000));
    await store.dispatch(pollInbox());

    expect(getFleet).toHaveBeenCalledWith({ window: { from: INBOX_WINDOW }, includeFlows: false });
  });

  it('does not pay for flows it will not read', async () => {
    // On a trace-backed plane, a day of flows is a scan billed per trace scanned. The inbox reasons
    // over counts, so asking for them would be paying for nothing.
    const getFleet = vi.fn(async (_query: FleetQuery) => fleetView());
    const store = createStore(fakeMeshApi({ getFleet }));

    await store.dispatch(pollInbox());

    expect(getFleet.mock.calls[0]?.[0]).toMatchObject({ includeFlows: false });
  });

  it('keeps the picker poll and the inbox poll apart', async () => {
    const getFleet = vi.fn(async (_query: FleetQuery) => fleetView());
    const store = createStore(fakeMeshApi({ getFleet }));

    store.dispatch(rangeChanged(60 * 60_000));
    await store.dispatch(probeFleet());
    await store.dispatch(pollInbox());

    expect(getFleet.mock.calls[0]?.[0]).toEqual({ window: { from: 'now-1h' } });
    expect(getFleet.mock.calls[1]?.[0]).toEqual({ window: { from: INBOX_WINDOW }, includeFlows: false });
  });

  it('drops signatures last seen outside the window', async () => {
    // The collector returns its issue map unfiltered — the contract says readers window on lastSeen.
    // Without that, the inbox shows every signature ever merged, including ones fixed weeks ago.
    const store = createStore(
      fakeMeshApi({ getFleet: async () => fleetView({ issues: [overnight, recent, lastWeek] }) }),
    );
    store.dispatch(clockTicked(NOW));
    await store.dispatch(pollInbox());

    expect(selectInboxIssues(store.getState()).map((i) => i.fingerprint)).toEqual(['recent', 'overnight']);
  });

  it('counts occurrences over the window, not over all time', async () => {
    const store = createStore(
      fakeMeshApi({ getFleet: async () => fleetView({ issues: [overnight, recent, lastWeek] }) }),
    );
    store.dispatch(clockTicked(NOW));
    await store.dispatch(pollInbox());

    // 9,000 occurrences from last week must not dominate today's roll-up.
    expect(selectIssueSummary(store.getState()).occurrences).toBe(415);
  });

  it('falls back to the picker view until the first inbox poll lands', async () => {
    // The inbox polls every five minutes. A reader arriving at second zero should not see an empty
    // inbox for five minutes when the live poll already has issues in hand.
    const store = createStore(fakeMeshApi());
    store.dispatch(clockTicked(NOW));
    store.dispatch(fleetObserved(fleetView({ issues: [recent] })));

    expect(selectInboxIssues(store.getState()).map((i) => i.fingerprint)).toEqual(['recent']);
  });

  it('does not filter before the clock has ticked', async () => {
    // `now` starts at 0, which would date every issue to the far future and empty the list.
    const store = createStore(
      fakeMeshApi({ getFleet: async () => fleetView({ issues: [overnight, lastWeek] }) }),
    );
    await store.dispatch(pollInbox());

    expect(selectInboxIssues(store.getState())).toHaveLength(2);
  });

  it('survives an inbox poll failing without taking the live plane down', async () => {
    // Two independent questions. The 15-second poll decides availability; the inbox does not.
    const store = createStore(
      fakeMeshApi({
        getFleet: async (query: FleetQuery) => {
          if (query.includeFlows === false) throw new Error('inbox scan timed out');
          return fleetView({ issues: [recent] });
        },
      }),
    );
    await store.dispatch(probeFleet());
    await store.dispatch(pollInbox());

    expect(store.getState().fleet.available).toBe(true);
    expect(store.getState().fleet.load).toBe('live');
  });
});
