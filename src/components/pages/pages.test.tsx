import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { act } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { loadAnnotations } from '../../store/slices/annotationsSlice';
import { fleetObserved, clockTicked } from '../../store/slices/fleetSlice';
import { fleetView, fleetService, meshIssue } from '../../test/fleetView';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import topics from '../../../contracts/artifacts/topics.json';
import type { Topics } from '../../contracts';
import { FleetPage } from './FleetPage';
import { ServicePage } from './ServicePage';
import { TopicPage } from './TopicPage';
import { IssuePage } from './IssuePage';
import { ComposePage } from './ComposePage';
import { TestConsolePage } from './TestConsolePage';
import { sendConfirmationToggled } from '../../store/slices/composeSlice';
import type { ReactElement } from 'react';

const loaded = async (withFleet = false) => {
  const store = createStore(fakeMeshApi());
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  await store.dispatch(loadAnnotations());
  if (withFleet) {
    store.dispatch(
      fleetObserved(
        fleetView({
          generatedAt: '2026-07-16T09:15:00Z',
          services: [fleetService({ service: 'orders-api', health: 'healthy', lastSeen: '2026-07-16T09:15:00Z' })],
          issues: [
            meshIssue({
              fingerprint: 'i1',
              service: 'payments-api',
              classification: 'exception',
              topic: 'payment:capture',
              exceptionType: 'System.NullReferenceException',
              lastSeen: '2026-07-16T09:14:00Z',
              count: 12,
            }),
          ],
        }),
      ),
    );
    store.dispatch(clockTicked(Date.parse('2026-07-16T09:15:10Z')));
  }
  return store;
};

const show = (store: Awaited<ReturnType<typeof loaded>>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

describe('FleetPage', () => {
  it('answers "is anything wrong" in counts, not in a sentence', async () => {
    // The roll-up used to be a line of running prose, so a reader had to *read* to discover the
    // estate was broken. The counts are the page's first-second answer and must be present as such.
    const store = await loaded();
    show(store, <FleetPage />);

    // Read the tiles directly: "Services" also appears as the section heading below them.
    const tiles = Object.fromEntries(
      [...document.querySelectorAll('.bz-stat')].map((el) => [
        // The label carries a status glyph too, so keep only the word.
        el.querySelector('.bz-stat-l')?.textContent?.replace(/[^\w ]/g, '').trim(),
        el.querySelector('.bz-stat-n')?.textContent,
      ]),
    );
    expect(tiles).toMatchObject({ Services: '3', Unhealthy: '1', Unreachable: '1' });
    // The name appears in the service list AND in the topology graph, so query the card's button —
    // the graph draws SVG text, not buttons.
    // Scoped to the service list: the topics catalog renders service names as buttons too.
    const cards = [...document.querySelectorAll('.bz-svc')].map((el) => el.getAttribute('data-service'));
    expect(cards).toContain('orders-api');
    expect(cards).toContain('payments-api');
  });

  it('hides the live sections entirely when no collector is wired', async () => {
    // Showing "0 issues" without a collector claims knowledge the dashboard does not have.
    const store = await loaded(false);
    show(store, <FleetPage />);

    expect(screen.queryByText(/issue occurrences/)).not.toBeInTheDocument();
    expect(screen.queryByText(/declaring healthy but/)).not.toBeInTheDocument();
  });

  it('puts what needs attention on the front door, not behind a link', async () => {
    // The whole issue surface used to be one hyperlink inside a paragraph. It is the reason a reader
    // opened the page, so it is a section on it.
    const store = await loaded(true);
    show(store, <FleetPage />);

    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByText('System.NullReferenceException on payment:capture')).toBeInTheDocument();
    // Two sections now hand off to a fuller list — issues and contract changes — so the assertion
    // has to name which one, or it passes on either and tests neither.
    const attention = screen.getByRole('heading', { name: 'Needs attention' }).closest('section')!;
    expect(within(attention).getByRole('button', { name: /see all/ })).toBeInTheDocument();
  });

  it('states the inbox window, because it is deliberately not the picked range', async () => {
    const store = await loaded(true);
    show(store, <FleetPage />);
    expect(screen.getByText('last 24 hours')).toBeInTheDocument();
  });

  it('orders services worst-first, so the problem is met before the healthy ones', async () => {
    // Manifest order is an arbitrary answer to "where is the problem".
    const store = await loaded();
    show(store, <FleetPage />);

    const names = [...document.querySelectorAll('.bz-svc')].map((el) => el.getAttribute('data-service'));
    expect(names).toEqual(['payments-api', 'shipping-api', 'orders-api']);
  });
});

describe('ServicePage', () => {
  it('renders a service from the store', async () => {
    const store = await loaded();
    show(store, <ServicePage service="orders-api" />);

    expect(screen.getByRole('heading', { name: 'orders-api' })).toBeInTheDocument();
    // Five cards, not eight peer sections. What a service's contract IS and whether it MOVED are the
    // same question, so they share a card; Calls stays separate because readers were reading a
    // produced topic as an outbound call when the two sat under peer headings.
    for (const card of ['Contract', 'Calls', 'State', 'Traffic']) {
      expect(screen.getByRole('heading', { name: card })).toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Consumes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Produces' })).toBeInTheDocument();
  });

  it('says so plainly when nothing in the estate refers to a service', async () => {
    // Neither plane knows it: a bad link or a stale bookmark, and the copy has to say that rather
    // than imply the service exists somewhere this page cannot reach.
    const store = await loaded();
    show(store, <ServicePage service="does-not-exist" />);

    expect(screen.getByText(/Nothing in this estate refers to does-not-exist/)).toBeInTheDocument();
  });

  it('renders what is known about a service the live plane sees but the manifest never catalogued', async () => {
    // The mesh's own host traces itself without being a discovered service, so the flow list links
    // to a service the manifest has never heard of. Answering that link with "not in the manifest"
    // is the tool contradicting the page one click back — those flows say it handled a message.
    const store = await loaded();
    act(() => {
      store.dispatch(
        fleetObserved(
          fleetView({
            generatedAt: '2026-07-16T09:15:00Z',
            services: [fleetService({ service: 'benzene-mesh', health: 'unknown' })],
          }),
        ),
      );
      store.dispatch(clockTicked(Date.parse('2026-07-16T09:15:10Z')));
    });
    show(store, <ServicePage service="benzene-mesh" />);

    expect(screen.getByText('not catalogued')).toBeInTheDocument();
    // The distinction the page exists to draw: what it DID is knowable, what it DECLARES is not.
    expect(screen.getByText(/never catalogued it/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Traffic' })).toBeInTheDocument();
    // ...and it must not claim the service declares nothing, which is a claim about the service.
    expect(screen.queryByRole('heading', { name: 'Consumes' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nothing in this estate refers to/)).not.toBeInTheDocument();
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

    // No message on the wire — the headline is composed from the stable parts of the fingerprint.
    expect(screen.getByText('System.NullReferenceException on payment:capture')).toBeInTheDocument();
    expect(screen.getByText(/12 occurrences/)).toBeInTheDocument();
  });

  it('reports an issue that has aged out of the window', async () => {
    const store = await loaded(true);
    show(store, <IssuePage selected="gone-from-window" />);
    expect(screen.getByText(/no longer in the observation window/)).toBeInTheDocument();
  });
});

describe('ComposePage', () => {
  it('seeds the body from the topic schema', async () => {
    const store = await loaded();
    const topic = store.getState().catalog.topics!.topics.find((t) => t.requestSchema && !t.reserved)!;
    show(store, <ComposePage topic={topic.topic} service="orders-api" />);

    const body = screen.getByLabelText(/Body/) as HTMLTextAreaElement;
    // Deterministic, so this is a real assertion rather than "something appeared".
    expect(() => JSON.parse(body.value)).not.toThrow();
    expect(body.value.length).toBeGreaterThan(2);
  });

  it('offers the raw transport for every topic', async () => {
    const store = await loaded();
    const topic = store.getState().catalog.topics!.topics.find((t) => !t.reserved)!;
    show(store, <ComposePage topic={topic.topic} service="orders-api" />);

    expect(screen.getByRole('option', { name: /raw \(benzene-message\)/ })).toBeInTheDocument();
  });

  it('says so when a topic cannot be composed against', async () => {
    const store = await loaded();
    show(store, <ComposePage topic="not-a-topic" service="orders-api" />);
    expect(screen.getByText(/no composable version/)).toBeInTheDocument();
  });

  it('explains a read-only mesh instead of offering a dead Send button', async () => {
    const store = await loaded();
    const topic = store.getState().catalog.topics!.topics.find((t) => !t.reserved)!;
    show(store, <ComposePage topic={topic.topic} service="orders-api" />);

    // fakeMeshApi has no sendMessage, so `capabilities.invoke` is false and the composer says why
    // rather than rendering a button that cannot work.
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    expect(screen.getByText(/no invoke endpoint configured/)).toBeInTheDocument();
  });

  it('offers Send, disabled, when the mesh advertises an invoke endpoint but sending is unconfirmed', async () => {
    const store = createStore(
      fakeMeshApi({ sendMessage: async () => ({ statusCode: 'ok', body: '{}', headers: {} }) }),
    );
    await store.dispatch(loadCatalog());
    const topic = store.getState().catalog.topics!.topics.find((t) => !t.reserved)!;
    show(store, <ComposePage topic={topic.topic} service="orders-api" />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('enables Send once the real-handler acknowledgement is confirmed', async () => {
    const store = createStore(
      fakeMeshApi({ sendMessage: async () => ({ statusCode: 'ok', body: '{}', headers: {} }) }),
    );
    await store.dispatch(loadCatalog());
    const topic = store.getState().catalog.topics!.topics.find((t) => !t.reserved)!;
    show(store, <ComposePage topic={topic.topic} service="orders-api" />);

    act(() => store.dispatch(sendConfirmationToggled()));

    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  /**
   * A dispatch INVOKES a topic on a target service, so the target has to be the one with the
   * handler. Resolving to the producer sent every composed message to the service that emits the
   * topic — which of course declares no handler for it — so the in-product path from a working v1
   * topic returned a red `no-handler` naming the wrong service. A false failure is the same defect
   * as a false pass with the sign flipped, and worse, because a tester raises a bug that isn't there.
   */
  it('dispatches to the service that HANDLES the topic, not the one that emits it', async () => {
    const store = await loaded();
    // payment:capture: produced by orders-api, handled by payments-api.
    show(store, <ComposePage topic="payment:capture" service={null} />);

    // Unambiguous, so no picker — and the target resolved is the handler.
    expect(screen.queryByLabelText('Service')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Body/)).toBeInTheDocument();
    expect(store.getState().compose.service).toBe('payments-api');
  });

  it('asks which service when a topic has more than one handler', async () => {
    const twoHandlers = {
      ...(topics as unknown as Topics),
      topics: (topics as unknown as Topics).topics.map((t) =>
        (t.topic === 'payment:capture'
          ? { ...t, consumers: [{ service: 'payments-api' }, { service: 'ledger-api' }] }
          : t)),
    };
    const store = createStore(fakeMeshApi({ getTopics: async () => twoHandlers as Topics }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    show(store, <ComposePage topic="payment:capture" service={null} />);

    expect(screen.getByLabelText('Service')).toBeInTheDocument();
    // Nothing chosen yet, so the composer itself does not render.
    expect(screen.queryByLabelText(/Body/)).not.toBeInTheDocument();
  });
});

describe('TestConsolePage', () => {
  it('starts with a service picker and no topic picker until one is chosen', async () => {
    const store = await loaded();
    show(store, <TestConsolePage service={null} topic={null} />);

    expect(screen.getByLabelText('Service')).toBeInTheDocument();
    expect(screen.queryByLabelText('Topic')).not.toBeInTheDocument();
  });

  it('offers only the topics a service produces or consumes, once picked', async () => {
    const store = await loaded();
    show(store, <TestConsolePage service="orders-api" topic={null} />);

    // orders:create is consumed by orders-api in the fixture.
    expect(screen.getByRole('option', { name: 'orders:create' })).toBeInTheDocument();
    // Reserved utility topics never belong in the composable list.
    expect(screen.queryByRole('option', { name: 'spec' })).not.toBeInTheDocument();
  });

  it('renders the composer once both service and topic are chosen', async () => {
    const store = await loaded();
    show(store, <TestConsolePage service="orders-api" topic="orders:create" />);

    expect(screen.getByLabelText(/Body/)).toBeInTheDocument();
  });

  it('lands directly on a pre-filled composer, for a runbook-style deep link', async () => {
    // The whole point of a service+topic prop pair: a link that already names both renders straight
    // to the composer, with no picking required.
    const store = createStore(
      fakeMeshApi({ sendMessage: async () => ({ statusCode: 'ok', body: '{}', headers: {} }) }),
    );
    await store.dispatch(loadCatalog());
    show(store, <TestConsolePage service="orders-api" topic="payment:capture" />);

    expect(screen.getByLabelText(/Body/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});

/**
 * Three defects a QA engineer found by treating the Test Console as the runbook step its own header
 * says it is. All three produce evidence that looks true and is not.
 */
describe('the Test Console as a runbook step', () => {
  it('seeds the version and the payload on a deep link, not just when clicked into', async () => {
    // The effect used to run once against a catalogue that had not arrived, and never again — the
    // service and topic in the URL never change. The console sat with `{}` for a body and no version
    // header, and would send it.
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadManifest());
    show(store, <TestConsolePage service="orders-api" topic="payment:capture" />);
    await store.dispatch(loadCatalog());

    await waitFor(() => {
      expect(JSON.parse(store.getState().compose.headersJson)).toHaveProperty('benzene-version');
    });
    expect(store.getState().compose.bodyJson).not.toBe('{}');
  });

  it('refuses a service that is not in the estate rather than offering to send to it', async () => {
    const store = await loaded();
    show(store, <TestConsolePage service="does-not-exist" topic="payment:capture" />);

    expect(screen.getByText(/does-not-exist is not in the estate manifest/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('does not claim a service is absent before the manifest has loaded', async () => {
    // An empty list means the estate has not loaded, not that the service does not exist.
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadCatalog());
    show(store, <TestConsolePage service="orders-api" topic="payment:capture" />);

    expect(screen.queryByText(/not in the estate manifest/)).toBeNull();
  });
});

describe('ServicePage — drift', () => {
  it('says what moved since the last run, not just that a hash changed', async () => {
    // The user-visible defect: the header badges `drift` and the row beneath it offered
    // `spec hash 5feaedb4… → b9b30797…` — a detection with no finding under it. The reader could not
    // tell which field moved, which topics it reached, or whether it broke anybody.
    const store = await loaded();
    show(store, <ServicePage service="orders-api" />);

    expect(screen.getByText(/Since the last run:/)).toBeInTheDocument();
    expect(screen.getByText(/1 field moved across 1 topic this service is on, 1 breaking/))
      .toBeInTheDocument();
  });
});
