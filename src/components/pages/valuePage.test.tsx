import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { act } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { utilityToggled } from '../../store/slices/viewSlice';
import { loadService } from '../../store/slices/estateSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { ValuePage } from './ValuePage';
import { ServicePage } from './ServicePage';
import { TopicPage } from './TopicPage';
import versioned from '../../../contracts/artifacts/topics.versioned.json';
import type { Topics } from '../../contracts';
import type { ReactElement } from 'react';

const loaded = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};

const show = (store: Awaited<ReturnType<typeof loaded>>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

describe('ValuePage', () => {
  it('leads with what the available evidence can actually support', async () => {
    const store = await loaded();
    show(store, <ValuePage />);
    expect(screen.getByText(/structural \+ observed-usage evidence/)).toBeInTheDocument();
  });

  it('says out loud that “unused” cannot be proven without a usage feed', async () => {
    // The page's whole value proposition is a retirement decision. Letting a reader believe it was
    // made on observed traffic when there was none is how a dashboard causes an outage.
    const store = await loaded({
      getUsage: async () => {
        throw new Error('no usage source wired');
      },
    });
    show(store, <ValuePage />);
    expect(screen.getByText(/no usage feed is wired/)).toBeInTheDocument();
  });

  it('groups topics into tiers with the evidence attached', async () => {
    const store = await loaded();
    show(store, <ValuePage />);

    expect(screen.getByText(/Retirement candidates/)).toBeInTheDocument();
    expect(screen.getByText(/no declared consumers/)).toBeInTheDocument();
  });

  it('reports removed topics separately from live candidates', async () => {
    const store = await loaded();
    show(store, <ValuePage />);

    expect(screen.getByText(/Removed since the previous run/)).toBeInTheDocument();
    expect(screen.getByText('order:export @ v0')).toBeInTheDocument();
  });

  it('reflects the utility toggle from state, not from a click', async () => {
    // The button is one way to produce the action. Deep-linking or a restored session is another,
    // and the page has to render the same either way — so the test drives the state directly.
    const store = await loaded();
    show(store, <ValuePage />);
    expect(screen.getByRole('button', { name: /show benzene utility topics/ })).toBeInTheDocument();

    act(() => {
      store.dispatch(utilityToggled());
    });
    expect(screen.getByRole('button', { name: /hide benzene utility topics/ })).toBeInTheDocument();
  });
});

describe('TopicPage version compatibility', () => {
  it('shows nothing when the aggregator reconciled nothing', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="orders:create" />);
    expect(screen.queryByRole('heading', { name: 'Version compatibility' })).not.toBeInTheDocument();
  });

  it('warns about a produced version nothing consumes, and admits an upcaster may bridge it', async () => {
    const store = await loaded({ getTopics: async () => versioned as Topics });
    show(store, <TopicPage topic="payment:capture" />);

    expect(screen.getByRole('heading', { name: 'Version compatibility' })).toBeInTheDocument();
    expect(screen.getByText(/forward-compatibility risk/)).toBeInTheDocument();
    expect(screen.getByText(/upcasters aren't visible to the mesh/)).toBeInTheDocument();
  });

  it('shows the HTTP routes a topic is reachable on', async () => {
    const store = await loaded({ getTopics: async () => versioned as Topics });
    show(store, <TopicPage topic="payment:capture" />);
    expect(screen.getByText('POST /payments/capture')).toBeInTheDocument();
  });
});

describe('ServicePage detail sections', () => {
  it("renders the service's own description once its snapshot loads", async () => {
    const store = await loaded({
      getService: async () => ({
        name: 'orders-api',
        fetchedAtUtc: '2026-08-09T05:58:11Z',
        specJson: JSON.stringify({ info: { description: 'Tracks orders end to end.', version: '2.4.0' } }),
        specHash: null,
        previousSpecHash: null,
        contractDrift: false,
        health: null,
        error: null,
      }),
    });
    await store.dispatch(loadService('orders-api'));
    show(store, <ServicePage service="orders-api" />);

    expect(screen.getByText('Tracks orders end to end.')).toBeInTheDocument();
    expect(screen.getByText('2.4.0')).toBeInTheDocument();
  });

  it('says the usage feed is unwired rather than showing an empty traffic panel', async () => {
    const store = await loaded({
      getUsage: async () => {
        throw new Error('no usage source wired');
      },
    });
    show(store, <ServicePage service="orders-api" />);

    expect(screen.getByText(/No usage feed is wired/)).toBeInTheDocument();
  });
});
