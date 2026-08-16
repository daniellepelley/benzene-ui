import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import {
  changeFilterChanged, changeModeSelected, changeServiceFiltered, changeStateFiltered,
} from '../../store/slices/viewSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { ChangesPage } from './ChangesPage';
import { FleetPage } from './FleetPage';
import type { Topics } from '../../contracts';
import topics from '../../../contracts/artifacts/topics.json';
import rollout from '../../../contracts/artifacts/topics.rollout.json';

const loaded = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};

const show = (store: Awaited<ReturnType<typeof loaded>>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

/** The same catalogue with every compatibility block stripped — an older or non-.NET aggregator. */
const withoutComparisons = (): Topics => ({
  ...(topics as unknown as Topics),
  topics: (topics as unknown as Topics).topics.map(({ ...t }) => {
    delete (t as { compatibility?: unknown }).compatibility;
    return t;
  }),
});

/**
 * The field-level ledger is no longer the default grain — Rollouts is — so these select it
 * explicitly. Before this they passed by coincidence, because a rollout row is also a `listitem`
 * carrying a `data-verdict`, which is exactly the sort of accident an explicit mode switch removes.
 */
const showLedger = (store: Awaited<ReturnType<typeof loaded>>) => {
  store.dispatch(changeModeSelected('changes'));
  return show(store, <ChangesPage />);
};

describe('the changes ledger', () => {
  it('ranks breaking changes above warnings and compatible ones', async () => {
    const store = await loaded();
    showLedger(store);

    const rows = screen.getAllByRole('listitem').filter((li) => li.dataset.verdict);
    const verdicts = rows.map((li) => li.dataset.verdict);
    expect(verdicts.indexOf('breaking')).toBeLessThan(verdicts.indexOf('warning'));
    expect(verdicts.indexOf('warning')).toBeLessThan(verdicts.indexOf('compatible'));
  });

  it('names the version pair, so a reader knows what was compared against what', async () => {
    const store = await loaded();
    showLedger(store);
    expect(screen.getAllByText('v1 → v2').length).toBeGreaterThan(0);
  });

  it('states its provenance, so the ledger is not read as "since yesterday"', async () => {
    // Run-over-run drift and cross-version compatibility lead to opposite actions, and the product
    // shows both. The heading alone does not distinguish them; this sentence does.
    const store = await loaded();
    showLedger(store);
    expect(
      screen.getByText(/Comparing each topic version against the version published before it/),
    ).toBeInTheDocument();
  });

  it('distinguishes "your filter matched nothing" from "nothing changed"', async () => {
    const store = await loaded();
    store.dispatch(changeFilterChanged('zzz-no-such-topic'));
    showLedger(store);

    expect(screen.getByText(/No change matches the current filter/)).toBeInTheDocument();
    expect(screen.queryByText(/No field-level change was detected/)).not.toBeInTheDocument();
  });

  it('says the aggregator did not compute comparisons, rather than reporting none', async () => {
    // A capability statement about the tool outranks a content statement about the estate: two of
    // the three ports that build a catalogue publish no comparisons, and an estate served by one of
    // them may still be running four versions of everything.
    const store = await loaded({ getTopics: async () => withoutComparisons() });
    showLedger(store);

    expect(screen.getByText(/did not publish contract comparisons/)).toBeInTheDocument();
    expect(screen.queryByText(/No field-level change was detected/)).not.toBeInTheDocument();
  });

  it('carries the scope caveat, so no verdict is read as a safety claim', async () => {
    const store = await loaded();
    showLedger(store);
    expect(screen.getByText(/It cannot see upcasters/)).toBeInTheDocument();
  });
});

describe('the estate tile for contract changes', () => {
  it('is a real button that leads to the ledger', async () => {
    // A number that reports a problem and cannot be followed is where triage stops. The previous
    // drift badge changed the cursor and did nothing, which had readers clicking it repeatedly.
    const store = await loaded();
    show(store, <FleetPage />);

    const tile = screen.getByRole('button', { name: /Contract changes/ });
    expect(tile).toBeInTheDocument();
  });

  it('shows a dash and "not computed" rather than a zero when nothing was compared', async () => {
    // A 0 here would be "absence rendered as good news" landing on the exact question the reader
    // came to ask.
    const store = await loaded({ getTopics: async () => withoutComparisons() });
    show(store, <FleetPage />);

    const stats = screen.getByText('Contract changes').closest('.bz-stat') as HTMLElement;
    expect(within(stats).getByText('—')).toBeInTheDocument();
    expect(within(stats).getByText('not computed')).toBeInTheDocument();
    expect(stats.tagName).toBe('DIV'); // inert: no onClick, so no false affordance
  });

  it('previews the worst changes on the front door', async () => {
    const store = await loaded();
    show(store, <FleetPage />);

    const section = screen.getByRole('heading', { name: 'Contract changes' }).closest('section')!;
    expect(within(section).getByRole('button', { name: /see all/ })).toBeInTheDocument();
  });
});

/**
 * The badge used to attach to whoever declared the NEW version — that is, whoever had already done
 * the work — because `services` was built from the entry carrying the change. The service that owed
 * the move rendered clean, and could not even be picked in the filter, because it appears on no
 * changed entry. Four personas reached this independently from four different jobs.
 */
describe('the ledger names the party that is late, not the party that finished', () => {
  const rolloutEstate = async () => {
    const store = createStore(fakeMeshApi({ getTopics: async () => rollout as unknown as Topics }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    return store;
  };

  it('splits the services into who owes the move and who has already made it', async () => {
    const store = await rolloutEstate();
    showLedger(store);

    const row = screen.getAllByRole('listitem')
      .find((li) => li.textContent?.includes('order:placed'))!;
    const owes = within(row).getByText('owes').parentElement!;
    const moved = within(row).getByText('moved').parentElement!;
    // billing-api consumes v1 and has not declared v2. orders-api produces both.
    expect(within(owes).getByRole('button', { name: 'billing-api' })).toBeTruthy();
    expect(within(moved).getByRole('button', { name: 'orders-api' })).toBeTruthy();
  });

  it('offers the late service in the filter, which is the population a release review enumerates', async () => {
    const store = await rolloutEstate();
    showLedger(store);

    const options = within(screen.getByLabelText('Filter changes by service'))
      .getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('billing-api');
  });

  it('finds the late service by free text, rather than answering that it has nothing to do', async () => {
    const store = await rolloutEstate();
    store.dispatch(changeFilterChanged('billing-api'));
    showLedger(store);

    const rows = screen.getAllByRole('listitem').filter((li) => li.dataset.verdict);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((li) => li.textContent?.includes('order:placed'))).toBe(true);
  });

  it('never badges a service for having moved to the current version', async () => {
    const store = await rolloutEstate();
    showLedger(store);

    // shipping:book is breaking and fully versioned out, so nobody owes anything on it.
    const row = screen.getAllByRole('listitem')
      .find((li) => li.textContent?.includes('shipping:book'))!;
    expect(within(row).queryByText('owes')).toBeNull();
  });
});

/**
 * The grain that answers the question a reader arrives with. A change is a field and a rollout is a
 * topic: `shipping:book` is one deploy decision and three field changes, and counting it three times
 * is how the estate's best-engineered topic became the reddest thing on screen.
 */
describe('the rollouts grain', () => {
  const rolloutEstate = async () => {
    const store = createStore(fakeMeshApi({ getTopics: async () => rollout as unknown as Topics }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    return store;
  };

  it('leads, because "who owes a deploy" is what a reader came for', async () => {
    const store = await rolloutEstate();
    show(store, <ChangesPage />);
    expect(screen.getByRole('button', { name: 'Rollouts' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('counts topics awaiting a move, not topics that changed', async () => {
    const store = await rolloutEstate();
    show(store, <ChangesPage />);
    // Six version pairs; four carry a breaking verdict; three still need somebody to do something.
    expect(screen.getByText(/of 6 awaiting a move/).textContent).toContain('4 of 6');
  });

  it('ranks the proven outage above the breaking changes that are merely uncovered', async () => {
    const store = await rolloutEstate();
    show(store, <ChangesPage />);

    const topics = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(topics[0]).toContain('inventory:reserve');
    // …and the versioned-out breaking change is last, not first.
    expect(topics[topics.length - 1]).toContain('shipping:book');
  });

  it('says something positive about a breaking change that was versioned out', async () => {
    const store = await rolloutEstate();
    show(store, <ChangesPage />);
    expect(screen.getByText(/has been versioned out/)).toBeInTheDocument();
  });

  it('states the ordering constraint between the two ends and never a sequence', async () => {
    const store = await rolloutEstate();
    show(store, <ChangesPage />);

    // Present tense here: shipping-api has already dropped v1, so the deadline has passed and a
    // "before X stops" sentence would read as "not yet urgent" on a call failing 100%.
    expect(screen.getByText(/shipping-api no longer handles inventory:reserve v1/)).toBeInTheDocument();
    expect(screen.getByText(/gap live now/)).toBeInTheDocument();
    // …and still future tense where the other side genuinely has not stopped.
    expect(screen.getAllByText(/before orders-api stops producing v1/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/must ship together/)).not.toBeInTheDocument();
    expect(screen.queryByText(/deploy first/i)).not.toBeInTheDocument();
  });

  it('keeps the service filter working across the grain switch', async () => {
    const store = await rolloutEstate();
    store.dispatch(changeServiceFiltered('billing-api'));
    show(store, <ChangesPage />);

    const topics = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(topics.some((t) => t.includes('order:placed'))).toBe(true);
    expect(topics.some((t) => t.includes('invoice:raise'))).toBe(true);
    expect(topics.some((t) => t.includes('notification:send'))).toBe(false);
  });

  it('distinguishes a filter that matched nothing from an estate with nothing to roll out', async () => {
    const store = await rolloutEstate();
    store.dispatch(changeStateFiltered('notCompared'));
    show(store, <ChangesPage />);

    expect(screen.getByText(/No rollout matches the current filter/)).toBeInTheDocument();
    expect(screen.queryByText(/nothing to roll out/)).not.toBeInTheDocument();
  });

  it('carries the dual-publish blind spot, which the schema caveat does not mention', async () => {
    const store = await rolloutEstate();
    show(store, <ChangesPage />);
    expect(screen.getByText(/whether a producer emits both versions of every message/)).toBeInTheDocument();
  });
});

/**
 * The tile went red whenever any change was breaking, which painted the estate red for a migration
 * that had been versioned out and needed nobody to do anything — a finished piece of work rendered
 * as an emergency, at the top of the first screen anybody opens.
 */
describe('the estate tile re-bases on the join', () => {
  const withTopics = async (t: unknown) => {
    const store = createStore(fakeMeshApi({ getTopics: async () => t as Topics }));
    await store.dispatch(loadManifest());
    await store.dispatch(loadCatalog());
    return store;
  };

  it('is red while a breaking change still has somebody outstanding', async () => {
    const store = await withTopics(rollout);
    show(store, <FleetPage />);
    const tile = screen.getAllByText('Contract changes')
      .map((el) => el.closest('.bz-stat')).find(Boolean) as HTMLElement;
    expect(tile.dataset.rag).toBe('red');
    expect(within(tile).getByText(/awaiting a move/)).toBeInTheDocument();
  });

  it('is not red for an estate whose breaking changes are all versioned out', async () => {
    // Strip the three uncovered rollouts, leaving only shipping:book and notification:send — both
    // fully dual-run, one of them breaking.
    const covered = {
      ...(rollout as unknown as Topics),
      topics: (rollout as unknown as Topics).topics.filter(
        (t) => ['shipping:book', 'notification:send', 'spec'].includes(t.topic)),
      versionCompatibility: (rollout as unknown as { versionCompatibility: { topic: string }[] })
        .versionCompatibility.filter((v) => ['shipping:book', 'notification:send'].includes(v.topic)),
    };
    const store = await withTopics(covered);
    show(store, <FleetPage />);

    const tile = screen.getAllByText('Contract changes')
      .map((el) => el.closest('.bz-stat')).find(Boolean) as HTMLElement;
    expect(tile.dataset.rag).not.toBe('red');
    expect(within(tile).getByText(/none of 2 topics awaiting a move/)).toBeInTheDocument();
  });

  it('previews rollouts rather than field diffs, which are not estate-level objects', async () => {
    const store = await withTopics(rollout);
    show(store, <FleetPage />);

    const section = screen.getByRole('heading', { name: 'Contract changes' }).closest('section')!;
    // The proven outage leads, and its constraint sentence is on the front door.
    expect(within(section).getByText(/shipping-api no longer handles inventory:reserve v1/)).toBeInTheDocument();
  });
});
