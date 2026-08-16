import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from './store';
import { loadManifest } from './slices/estateSlice';
import { loadCatalog } from './slices/catalogSlice';
import { fleetObserved } from './slices/fleetSlice';
import { fleetView, fleetService } from '../test/fleetView';
import { fakeMeshApi } from '../test/fakeMeshApi';
import { selectLiveForService } from './selectors';
import { ServiceUsage } from '../components/sections/ServiceUsage';
import { IssuePage } from '../components/pages/IssuePage';
import type { ServiceUsageSummary } from './selectors';

/**
 * Round 7's small verified defects — each one checked against the DOM or the source before it
 * entered the record, and each one a sentence or a render rather than a feature.
 *
 * They are grouped because they share a cause: a fact the product had, stated in a form the reader
 * could not act on. That is the wave's headline at its smallest grain.
 */
const ready = async () => {
  const store = createStore(fakeMeshApi());
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};

describe('the usage feed says what it counted, which is handling', () => {
  it('does not invite the producer misreading in its empty state', () => {
    // MeshUsageEntry.service is the HANDLING service, so this feed structurally cannot say who
    // produced anything. "Reported nothing for this service" was read by a delivery owner as
    // evidence that a topic the service declares it PRODUCES had gone dormant — a category error the
    // copy encouraged. Their question is right; this feed cannot answer it.
    const empty: ServiceUsageSummary = {
      mode: 'own', entries: [], hidden: { entries: 0, messages: 0 }, allUtility: false,
    };
    render(<ServiceUsage usage={empty} showUtility={false} now={0} />);

    expect(screen.getByText(/observed nothing handled by this service/)).toBeInTheDocument();
    expect(screen.getByText(/says nothing either way about what this service produces/)).toBeInTheDocument();
  });
});

describe('the service Traffic panel reads both planes', () => {
  it('reports the live plane’s own count for the service', async () => {
    // The card read usage.json alone, so a service the collector was actively watching could say it
    // observed nothing while the live plane reported thousands two selectors away.
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api', invocations: 4820, errors: 17 })],
    })));

    const live = selectLiveForService(store.getState(), 'orders-api');
    expect(live.observed).toBe(4820);
    expect(live.errors).toBe(17);
  });

  it('reports null, not zero, when the plane declares it has no usage feed for the service', async () => {
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api', invocations: 0, missingFeeds: ['usage'] })],
    })));

    const live = selectLiveForService(store.getState(), 'orders-api');
    expect(live.observed).toBeNull();
    expect(live.errors).toBeNull();
    expect(live.missingFeeds).toEqual(['usage']);
  });

  it('reports null when the plane has no row for the service at all', async () => {
    const store = await ready();
    store.dispatch(fleetObserved(fleetView({ services: [fleetService({ service: 'payments-api' })] })));
    expect(selectLiveForService(store.getState(), 'orders-api').observed).toBeNull();
  });

  it('claims nothing when no collector is wired', async () => {
    const store = await ready();
    const live = selectLiveForService(store.getState(), 'orders-api');
    expect(live.available).toBe(false);
    expect(live.observed).toBeNull();
  });
});

describe('an issue detail page states its headline once', () => {
  it('does not render the list row’s card under a header that already said the same thing', async () => {
    // The one screen an on-call engineer opens under time pressure led with its own title twice,
    // inside a button that navigates nowhere because the reader is already there.
    const store = await ready();
    const issue = {
      fingerprint: 'fp-1',
      service: 'payments-api',
      topic: 'payment:capture',
      version: 'v1',
      status: 'exception',
      classification: 'exception',
      exceptionType: 'TimeoutException',
      count: 2205,
      firstSeen: '2026-08-09T01:00:00Z',
      lastSeen: '2026-08-09T05:59:00Z',
      exemplarTraceIds: ['abc123'],
      resolutionHint: null,
    };
    store.dispatch(fleetObserved(fleetView({ issues: [issue] as never })));

    render(<Provider store={store}><IssuePage selected="fp-1" /></Provider>);

    expect(screen.getAllByText('TimeoutException on payment:capture')).toHaveLength(1);
    expect(screen.getAllByText('exception')).toHaveLength(1);
    // What the row carried and the header did not, kept: the sentence and the occurrence count.
    expect(screen.getByText(/The handler threw/)).toBeInTheDocument();
    expect(screen.getByText('×2,205')).toBeInTheDocument();
  });
});
