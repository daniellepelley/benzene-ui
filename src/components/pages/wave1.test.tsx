import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { fleetObserved, clockTicked } from '../../store/slices/fleetSlice';
import { fleetView, fleetService } from '../../test/fleetView';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { parseHash, toHash } from '../../store/routing';
import { FleetPage } from './FleetPage';
import { ServicePage } from './ServicePage';
import { TopicPage } from './TopicPage';
import { TopicsPage } from './TopicsPage';
import { App } from '../../App';

const loaded = async () => {
  const store = createStore(fakeMeshApi());
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};
const show = (store: Awaited<ReturnType<typeof loaded>>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

/**
 * Wave 1 of the improvement plan: executing rulings that had been made and never landed.
 *
 * These assertions exist because each of these was ruled once already and shipped anyway for
 * months. A ruling with no test is a preference; a ruling with a test is a decision.
 */
describe('the estate answers its own question', () => {
  it('leads with a verdict sentence, not five numbers', async () => {
    // The page's owned question is "what state is the estate in, and what should I look at first?"
    // and nothing on it answered either half — the reader did arithmetic across five tiles.
    const store = await loaded();
    show(store, <FleetPage />);

    const verdict = document.querySelector('.bz-estate-verdict')!;
    expect(verdict).toBeTruthy();
    expect(verdict.textContent).toMatch(/3 services/);
    expect(verdict.textContent).toMatch(/unhealthy|unreachable|awaiting a contract move|disagree/);
  });

  it('states a clean estate as a sentence rather than a row of zeros', async () => {
    const healthy = {
      generatedAtUtc: '2026-07-16T09:00:00Z',
      services: [{ name: 'a', status: 'healthy', contractDrift: false }],
    };
    // The catalogue is stubbed empty too: a clean estate means nothing outstanding on EITHER axis,
    // and the shared fixture carries six rollouts.
    const store = createStore(fakeMeshApi({
      getManifest: async () => healthy as never,
      getTopics: async () => ({ generatedAtUtc: '2026-07-16T09:00:00Z', topics: [] }) as never,
    }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <FleetPage />);

    expect(screen.getByText(/All 1 services are healthy/)).toBeInTheDocument();
  });

  it('collapses the divergence banners into one countable block', async () => {
    // Four sibling paragraphs of amber prose could not be counted at a glance, so a reader could not
    // tell how many DIFFERENT things were wrong.
    const store = await loaded();
    store.dispatch(fleetObserved(fleetView({
      services: [fleetService({ service: 'orders-api' }), fleetService({ service: 'promo-api' })],
    })));
    store.dispatch(clockTicked(Date.parse('2026-07-16T09:15:10Z')));
    show(store, <FleetPage />);

    const heading = screen.getByRole('heading', { name: /Declared and observed disagree/ });
    expect(heading.textContent).toMatch(/\(\d+\)/);
    // Identity is never painted with a status colour: names are plain buttons, not warn chips.
    const block = heading.closest('section')!;
    expect(within(block).getByRole('button', { name: 'promo-api' })).toBeInTheDocument();
  });

  it('no longer carries the topics catalogue, the topology or the flows', async () => {
    // None of the three answers "what should I look at first?"; two of them answer aim 1 and now
    // live on the Topics page, and flow-browsing is a per-subject activity.
    const store = await loaded();
    show(store, <FleetPage />);

    expect(screen.queryByRole('heading', { name: 'Topics' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Topology' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recent flows' })).not.toBeInTheDocument();
  });
});

describe('every screen is reachable', () => {
  it('offers six destinations, including the two that had no route', async () => {
    const store = await loaded();
    show(store, <App />);

    const nav = document.querySelector('.bz-nav')!;
    const labels = [...nav.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(['Estate', 'Topics', 'Changes', 'Issues', 'Retire', 'Test']);
  });

  it('routes Topics, which had no hash at all', () => {
    expect(parseHash('#topics').page).toBe('topics');
    expect(toHash('topics', null)).toBe('#topics');
  });

  it('renames Value to Retire without breaking existing links', () => {
    // The reader's question is "what could we retire?"; "value" was the product's word for it.
    expect(toHash('retire', null)).toBe('#retire');
    // The old spelling still parses, and is deliberately absent from toHash so the address bar
    // converges on the new one.
    expect(parseHash('#value').page).toBe('retire');
    expect(parseHash('#retire').page).toBe('retire');
  });

  it('gives the Topics page the catalogue as its subject', async () => {
    const store = await loaded();
    show(store, <TopicsPage />);
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeInTheDocument();
  });
});

describe('the merged compose route', () => {
  it('translates an old #compose link onto the console rather than dropping it', () => {
    // A bookmark is a promise the product made.
    const route = parseHash('#compose/orders%3Acreate@v2');
    expect(route.page).toBe('test');
    expect(route.selected).toBe('orders:create');
    expect(route.selectedVersion).toBe('v2');
  });

  it('sends the topic page’s action to the console, carrying the version', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="orders:create" />);

    screen.getByRole('button', { name: /test this topic/ }).click();
    expect(store.getState().view.page).toBe('test');
    expect(store.getState().view.selected).toBe('orders:create');
    // The version the reader was LOOKING at, or the console seeds a body they did not ask for.
    expect(store.getState().view.selectedVersion).toBeTruthy();
  });
});

describe('discussion is gone', () => {
  it('is absent from both pages that carried it', async () => {
    const store = await loaded();
    show(store, <ServicePage service="orders-api" />);
    expect(screen.queryByRole('heading', { name: 'Discussion' })).not.toBeInTheDocument();
  });

  it('is absent from the topic page too', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="orders:create" />);
    expect(screen.queryByRole('heading', { name: 'Discussion' })).not.toBeInTheDocument();
  });
});

describe('the test console no longer contradicts the product', () => {
  it('does not invite bookmarking as a production runbook step', async () => {
    // MeshDispatchGate refuses to dispatch in production by default. The copy told readers to build
    // a production runbook around it — the product contradicting itself, in an instruction.
    const { TestConsolePage } = await import('./TestConsolePage');
    const store = await loaded();
    show(store, <TestConsolePage service={null} topic={null} />);

    expect(screen.queryByText(/production runbook/)).not.toBeInTheDocument();
  });
});

/**
 * Wave 2: the clarity sweep. Each of these was a case of one meaning wearing several looks, or
 * several meanings wearing one.
 */
describe('a measurement, an alarm, an absence and a provenance note look different', () => {
  it('does not render a failure share and a missing one as the same element', async () => {
    const { EdgeList } = await import('../controls/EdgeList');
    const measured = [{
      client: 'orders-api', server: 'payments-api', source: 'tempo',
      requestsPerMinute: 18, errorRate: 0.18,
    }] as never;
    const { container, unmount } = render(<EdgeList edges={measured} show="server" emptyMessage="none" now={0} />);
    expect(container.querySelector('[data-kind="alarm"]')?.textContent).toMatch(/of calls failed/);
    // Provenance is not a pill and never competes with the number it annotates.
    expect(container.querySelector('.bz-provenance')?.textContent).toContain('via tempo');
    unmount();

    const unmeasured = [{
      client: 'orders-api', server: 'payments-api', source: 'tempo',
      requestsPerMinute: 18, errorRate: null,
    }] as never;
    const second = render(<EdgeList edges={unmeasured} show="server" emptyMessage="none" now={0} />);
    // The SAME slot, and it must not look like a small bad number.
    expect(second.container.querySelector('[data-kind="absent"]')?.textContent)
      .toMatch(/error rate not reported/);
    expect(second.container.querySelector('[data-kind="alarm"]')).toBeNull();
  });

  it('puts the text that prevented a Sev1 misreading in the visible plane, not a tooltip', async () => {
    const { EdgeList } = await import('../controls/EdgeList');
    const edges = [{
      client: 'orders-api', server: 'payments-api', source: 'tempo',
      requestsPerMinute: 18, errorRate: 0.18,
    }] as never;
    const { container } = render(<EdgeList edges={edges} show="server" emptyMessage="none" now={0} />);

    expect(container.querySelector('.bz-keyline')?.textContent).toMatch(/per-edge/);
    // ...and nothing on this surface hides text in a hover any more.
    expect(container.querySelector('[title]')).toBeNull();
  });
});

describe('colour means status, and nothing else', () => {
  it('does not paint HTTP verbs with the status palette', async () => {
    // GET green / DELETE red put a classification into the verdict vocabulary: nothing is wrong
    // with a DELETE, and it rendered in the same red the estate uses for "unhealthy".
    const source = readFileSync(
      join(import.meta.dirname, '..', 'sections', 'SpecOperation.tsx'), 'utf8',
    );
    expect(source).not.toMatch(/METHOD_RAG/);
    expect(source).toMatch(/bz-op-kind/);
  });

  it('does not paint an identity with a status colour', async () => {
    const store = await loaded();
    show(store, <ServicePage service="orders-api" />);
    const team = [...document.querySelectorAll('.bz-chip')]
      .find((c) => c.textContent === 'Fulfilment');
    if (team) expect(team.getAttribute('data-tone')).toBeNull();
  });
});
