import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactElement } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { changeFilterChanged } from '../../store/slices/viewSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { ChangesPage } from './ChangesPage';
import { FleetPage } from './FleetPage';
import type { Topics } from '../../contracts';
import topics from '../../../contracts/artifacts/topics.json';

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

describe('the changes ledger', () => {
  it('ranks breaking changes above warnings and compatible ones', async () => {
    const store = await loaded();
    show(store, <ChangesPage />);

    const rows = screen.getAllByRole('listitem').filter((li) => li.dataset.verdict);
    const verdicts = rows.map((li) => li.dataset.verdict);
    expect(verdicts.indexOf('breaking')).toBeLessThan(verdicts.indexOf('warning'));
    expect(verdicts.indexOf('warning')).toBeLessThan(verdicts.indexOf('compatible'));
  });

  it('names the version pair, so a reader knows what was compared against what', async () => {
    const store = await loaded();
    show(store, <ChangesPage />);
    expect(screen.getAllByText('v1 → v2').length).toBeGreaterThan(0);
  });

  it('states its provenance, so the ledger is not read as "since yesterday"', async () => {
    // Run-over-run drift and cross-version compatibility lead to opposite actions, and the product
    // shows both. The heading alone does not distinguish them; this sentence does.
    const store = await loaded();
    show(store, <ChangesPage />);
    expect(
      screen.getByText(/Comparing each topic version against the version published before it/),
    ).toBeInTheDocument();
  });

  it('distinguishes "your filter matched nothing" from "nothing changed"', async () => {
    const store = await loaded();
    store.dispatch(changeFilterChanged('zzz-no-such-topic'));
    show(store, <ChangesPage />);

    expect(screen.getByText(/No change matches the current filter/)).toBeInTheDocument();
    expect(screen.queryByText(/No field-level change was detected/)).not.toBeInTheDocument();
  });

  it('says the aggregator did not compute comparisons, rather than reporting none', async () => {
    // A capability statement about the tool outranks a content statement about the estate: two of
    // the three ports that build a catalogue publish no comparisons, and an estate served by one of
    // them may still be running four versions of everything.
    const store = await loaded({ getTopics: async () => withoutComparisons() });
    show(store, <ChangesPage />);

    expect(screen.getByText(/did not publish contract comparisons/)).toBeInTheDocument();
    expect(screen.queryByText(/No field-level change was detected/)).not.toBeInTheDocument();
  });

  it('carries the scope caveat, so no verdict is read as a safety claim', async () => {
    const store = await loaded();
    show(store, <ChangesPage />);
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
