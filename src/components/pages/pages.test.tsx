import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { act } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { loadAnnotations } from '../../store/slices/annotationsSlice';
import { fleetObserved, clockTicked } from '../../store/slices/fleetSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { FleetPage } from './FleetPage';
import { ServicePage } from './ServicePage';
import { TopicPage } from './TopicPage';
import { IssuePage } from './IssuePage';
import type { ReactElement } from 'react';

const loaded = async (withFleet = false) => {
  const store = createStore(fakeMeshApi());
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  await store.dispatch(loadAnnotations());
  if (withFleet) {
    store.dispatch(
      fleetObserved({
        observedAtUtc: '2026-07-16T09:15:00Z',
        heartbeats: [{ service: 'orders-api', lastSeenUtc: '2026-07-16T09:15:00Z' }],
        issues: [{ id: 'i1', service: 'payments-api', classification: 'exception', message: 'boom', observedAtUtc: '2026-07-16T09:14:00Z', count: 12 }],
        flows: [],
      }),
    );
    store.dispatch(clockTicked(Date.parse('2026-07-16T09:15:10Z')));
  }
  return store;
};

const show = (store: Awaited<ReturnType<typeof loaded>>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

describe('FleetPage', () => {
  it('rolls the estate up and lists its services', async () => {
    const store = await loaded();
    show(store, <FleetPage />);

    expect(screen.getByRole('heading', { name: 'Estate' })).toBeInTheDocument();
    // The name appears in the service list AND in the topology graph, so query the card's button —
    // the graph draws SVG text, not buttons.
    expect(screen.getByRole('button', { name: 'orders-api' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'payments-api' })).toBeInTheDocument();
  });

  it('hides the live sections entirely when no collector is wired', async () => {
    // Showing "0 issues" without a collector claims knowledge the dashboard does not have.
    const store = await loaded(false);
    show(store, <FleetPage />);

    expect(screen.queryByText(/issue occurrences/)).not.toBeInTheDocument();
    expect(screen.queryByText(/declaring healthy but/)).not.toBeInTheDocument();
  });

  it('surfaces issue occurrences once a collector is live', async () => {
    const store = await loaded(true);
    show(store, <FleetPage />);

    expect(screen.getByText(/12 issue occurrences/)).toBeInTheDocument();
  });
});

describe('ServicePage', () => {
  it('renders a service from the store', async () => {
    const store = await loaded();
    show(store, <ServicePage service="orders-api" />);

    expect(screen.getByRole('heading', { name: 'orders-api' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Calls' })).toBeInTheDocument();
  });

  it('says so plainly when a service is not in the manifest', async () => {
    const store = await loaded();
    show(store, <ServicePage service="does-not-exist" />);

    expect(screen.getByText(/is not in the estate manifest/)).toBeInTheDocument();
  });

  it('explains an unreachable service instead of showing an empty health panel', async () => {
    const store = await loaded();
    await act(async () => {
      await store.dispatch({ type: 'estate/loadService/fulfilled', payload: { name: 'shipping-api', fetchedAtUtc: '2026-07-16T09:15:00Z', specJson: null, specHash: null, previousSpecHash: null, contractDrift: false, health: null, error: 'Connection refused' } });
    });
    show(store, <ServicePage service="shipping-api" />);

    expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
  });
});

describe('TopicPage', () => {
  it('renders a topic, its peers and its traffic', async () => {
    const store = await loaded();
    const topic = store.getState().catalog.topics!.topics[0]!.topic;
    show(store, <TopicPage topic={topic} />);

    expect(screen.getByRole('heading', { name: topic })).toBeInTheDocument();
    expect(screen.getByText('Consumers')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Traffic' })).toBeInTheDocument();
  });

  it('says so when a topic is not in the catalog', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="not-a-real-topic" />);
    expect(screen.getByText(/is not in the published catalog/)).toBeInTheDocument();
  });
});

describe('IssuePage', () => {
  it('distinguishes "no collector" from "no issues"', async () => {
    const store = await loaded(false);
    show(store, <IssuePage selected="all" />);

    expect(screen.getByText(/not the same as there being none/)).toBeInTheDocument();
  });

  it('lists issues when a collector is live', async () => {
    const store = await loaded(true);
    show(store, <IssuePage selected="all" />);

    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByText(/12 occurrences/)).toBeInTheDocument();
  });

  it('reports an issue that has aged out of the window', async () => {
    const store = await loaded(true);
    show(store, <IssuePage selected="gone-from-window" />);
    expect(screen.getByText(/no longer in the observation window/)).toBeInTheDocument();
  });
});
