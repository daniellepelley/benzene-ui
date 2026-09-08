import { describe, it, expect } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from '../../store/store';
import { loadManifest, MeshFetchError } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { probeFleet, clockTicked } from '../../store/slices/fleetSlice';
import { navigated } from '../../store/slices/viewSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { App } from '../../App';
import { SetupPage } from './SetupPage';
import { FleetPage } from './FleetPage';
import { ServicePage } from './ServicePage';
import type { ReactElement } from 'react';

const show = (store: ReturnType<typeof createStore>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

/**
 * THE PRODUCT RULE THIS FILE PINS: a mesh works on the subset it has, so the pages render only what
 * they can stand behind and say nothing about what is not wired. The reasons live on ONE page, and
 * the chrome carries ONE number — the things that need a person — never a sentence.
 */
describe('SetupPage', () => {
  it('lists every capability with its state, and what wiring the unwired ones need', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    await store.dispatch(probeFleet());
    show(store, <SetupPage />);

    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument();
    for (const label of ['Catalog', 'Topics', 'Topology', 'Usage feed', 'Live plane', 'Dispatch', 'Refresh', 'Sign-in', 'Environment label']) {
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    }
    const live = screen.getByRole('heading', { name: 'Live plane' }).closest('.bz-setup-item')!;
    expect(live).toHaveAttribute('data-state', 'off');
    expect(within(live as HTMLElement).getByText(/data-fleet-url/)).toBeInTheDocument();
    // The environment label is a setup concern, stated here and nowhere else.
    const environment = screen.getByRole('heading', { name: 'Environment label' }).closest('.bz-setup-item')!;
    expect(within(environment as HTMLElement).getByText(/not published/)).toBeInTheDocument();
    expect(screen.getByText('nothing needs attention')).toBeInTheDocument();
  });

  it('shows the read failure — status, URL — on the feed’s own row', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => { throw new MeshFetchError('503 Service Unavailable for topics.json', 503); },
    }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <SetupPage />);

    const topics = screen.getByRole('heading', { name: 'Topics' }).closest('.bz-setup-item')!;
    expect(topics).toHaveAttribute('data-state', 'failing');
    expect(within(topics as HTMLElement).getByText('503 Service Unavailable for topics.json')).toBeInTheDocument();
    expect(screen.getByText('1 needs attention')).toBeInTheDocument();
  });

  it('renders one row per service with what it is and is not supplying', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <SetupPage />);

    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(store.getState().estate.services.length);
    // The unreachable one carries its hint; the others carry none.
    expect(within(table).getByText(/could not reach it/)).toBeInTheDocument();
  });

  it('is reachable when the manifest itself failed to load — it is the page that explains why', async () => {
    const store = createStore(fakeMeshApi({
      getManifest: async () => { throw new MeshFetchError('500 Internal Server Error for manifest.json', 500); },
    }));
    await store.dispatch(loadManifest());
    store.dispatch(navigated({ page: 'setup' }));
    show(store, <App />);

    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument();
    // The app shell re-issues the load on mount, so the row passes through `pending` before the
    // second failure lands; the state to pin is where it settles.
    await waitFor(() => {
      const catalog = screen.getByRole('heading', { name: 'Catalog' }).closest('.bz-setup-item')!;
      expect(catalog).toHaveAttribute('data-state', 'failing');
    });
  });
});

describe('the chrome carries a count, never a sentence', () => {
  it('shows no badge on a partial mesh that is working as configured', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    await store.dispatch(probeFleet());
    show(store, <App />);

    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument();
    expect(document.querySelector('.bz-nav-badge')).toBeNull();
    // And no sentence about the unwired live plane, usage feed or environment anywhere in the chrome.
    expect(document.querySelector('.bz-feed-health')).toBeNull();
    expect(document.querySelector('.bz-app-env')).toBeNull();
  });

  it('counts a failing feed on the Setup button and keeps the estate page free of the banner', async () => {
    const store = createStore(fakeMeshApi({
      getUsage: async () => { throw new MeshFetchError('500 Internal Server Error for usage.json', 500); },
    }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <App />);

    const badge = document.querySelector('.bz-nav-badge')!;
    expect(badge.textContent).toBe('1');
    expect(badge).toHaveAttribute('data-worst', 'failing');
    expect(screen.queryByText(/could not be read \(/)).not.toBeInTheDocument();
  });

  it('counts a blind live plane as degraded rather than writing it above every page', async () => {
    const store = createStore(
      fakeMeshApi({ getFleet: async () => ({ generatedAt: '2026-09-08T09:00:00Z', services: [], topics: [], traces: [], issues: [] }) }),
      { capabilities: { fleet: true, invoke: false, refresh: false, manifestUrl: null, logoutUrl: null, environment: null } },
    );
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    store.dispatch(clockTicked(Date.parse('2026-09-08T09:00:05Z')));
    await store.dispatch(probeFleet());
    show(store, <App />);

    expect(document.querySelector('.bz-nav-badge')).toHaveAttribute('data-worst', 'degraded');
    expect(document.querySelector('.bz-feed-health')).toBeNull();
  });
});

describe('the pages go quiet, but never claim what they cannot know', () => {
  it('estate: an unreadable feed is neither a banner nor an empty estate', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => { throw new MeshFetchError('503 Service Unavailable for topics.json', 503); },
    }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <FleetPage />);

    expect(document.querySelector('.bz-feed-health')).toBeNull();
    expect(screen.queryByText(/could not be read \(/)).not.toBeInTheDocument();
  });

  it('service: an unreadable topics feed reads as unknown with a way to the reason, not as “consumes nothing”', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => { throw new MeshFetchError('503 Service Unavailable for topics.json', 503); },
    }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <ServicePage service="orders-api" />);

    expect(screen.queryByText('Consumes nothing.')).not.toBeInTheDocument();
    expect(screen.queryByText(/503/)).not.toBeInTheDocument();
    const unknowns = screen.getAllByText(/Unknown — the topics feed could not be read/);
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns[0]!.closest('.bz-empty')).toHaveAttribute('data-tone', 'unknown');
    expect(screen.getAllByRole('button', { name: 'See Setup' }).length).toBeGreaterThan(0);
  });

  it('service: the collector’s missing feeds are no longer a banner at the top of the page', async () => {
    const store = createStore(fakeMeshApi(), {
      capabilities: { fleet: true, invoke: false, refresh: false, manifestUrl: null, logoutUrl: null, environment: null },
    });
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    store.dispatch({
      type: 'fleet/fleetObserved',
      payload: {
        generatedAt: '2026-09-08T09:00:00Z', traces: [], topics: [], issues: [],
        services: [{ service: 'orders-api', placement: {}, topics: 1, instances: 1, health: 'healthy', invocations: 0, errors: 0, missingFeeds: ['health', 'usage'] }],
      },
    });
    show(store, <ServicePage service="orders-api" />);

    expect(screen.queryByText(/The collector reports no/)).not.toBeInTheDocument();
    // The strips still say it in place, where the figure would have been.
    expect(screen.getAllByText(/does not supply|not supplied by this plane/).length).toBeGreaterThan(0);
  });
});
