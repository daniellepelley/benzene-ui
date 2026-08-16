import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { act } from 'react';
import type { ReactElement } from 'react';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { topicVersionSelected } from '../../store/slices/viewSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { TopicPage } from './TopicPage';

const loaded = async () => {
  const store = createStore(fakeMeshApi());
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};

const show = (store: Awaited<ReturnType<typeof loaded>>, ui: ReactElement) =>
  render(<Provider store={store}>{ui}</Provider>);

/**
 * The breaking-change surface, tested against the honesty rules rather than the happy path.
 *
 * Three rounds of user testing found the same failure repeatedly: the product stating a verdict it
 * had not earned. So most of what is asserted here is what the page must NOT say — no all-clear over
 * a comparison that never ran, no silence where a reader would read reassurance, no count presented
 * as a total when a type change stopped the walk.
 */
describe('contract changes on the topic page', () => {
  it('opens the newest version, not the oldest', async () => {
    // This is the defect that hid every schema change in the estate. `topics.find(...)` returned the
    // LOWEST version, so the page rendered the pre-release contract under a v1 chip while the fleet
    // ran v2 — a data map built from this page recorded fields that had already been deleted.
    const store = await loaded();
    show(store, <TopicPage topic="orders:create" />);

    expect(screen.getByRole('heading', { name: 'Changed from v1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'v2' })).toHaveAttribute('aria-current', 'true');
  });

  it('names the field, the side and the kind — not just that something changed', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="orders:create" />);

    expect(screen.getByText("Property 'channel' was added (required)")).toBeInTheDocument();
    expect(screen.getByText("Property 'customerId' was removed")).toBeInTheDocument();
  });

  it('attributes the verdict to the rule table rather than stating it as a fact', async () => {
    // SchemaCompatibilityRules is configurable and ships a Strict() alternative, so a bare
    // "breaking" would assert something the product cannot know.
    const store = await loaded();
    show(store, <TopicPage topic="orders:create" />);

    expect(screen.getAllByText('by Benzene’s default rules').length).toBeGreaterThan(0);
  });

  it('never claims safety, even when the verdict is compatible', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="notification:send" />);

    expect(screen.getByText(/compares published payload schemas only/)).toBeInTheDocument();
    expect(screen.queryByText(/\bsafe\b/i)).not.toBeInTheDocument();
  });

  it('says "not compared" for a single-version topic, and never "compatible"', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="order:legacy-export" />);

    expect(
      screen.getByText('Only one version of this topic is published, so there is nothing to compare.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('compatible')).not.toBeInTheDocument();
  });

  it('warns that a type change hid whatever sits beneath it', async () => {
    // The comparer stops at a changed type, so the change count below one is a floor. A UI that does
    // not say so is presenting a total it did not earn.
    const store = await loaded();
    show(store, <TopicPage topic="payment:capture" />);

    expect(screen.getByText(/so fields beneath were not compared/)).toBeInTheDocument();
  });

  it('marks removed fields on the contract itself, drawn from the previous version', async () => {
    // A removed field is by definition absent from the schema being rendered. Without the baseline
    // the most consequential class of change would be the one class invisible on the tree.
    const store = await loaded();
    show(store, <TopicPage topic="shipping:book" />);

    expect(screen.getByText('line2')).toBeInTheDocument();
    expect(screen.getAllByText('removed').length).toBeGreaterThan(0);
  });

  it('lets a reader move to an older version and shows that version’s contract', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="shipping:book" />);
    act(() => {
      store.dispatch(topicVersionSelected('v1'));
    });

    // v1 is the oldest, so there is nothing before it to compare against — and the page says so
    // rather than going quiet.
    expect(screen.queryByRole('heading', { name: /^Changed from/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'v1' })).toHaveAttribute('aria-current', 'true');
  });

  it('does not offer a version switcher when there is only one version', async () => {
    const store = await loaded();
    show(store, <TopicPage topic="order:legacy-export" />);

    expect(screen.queryByRole('group', { name: 'Topic version' })).not.toBeInTheDocument();
  });
});
