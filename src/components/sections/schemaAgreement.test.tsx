import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from '../../store/store';
import { loadManifest } from '../../store/slices/estateSlice';
import { loadCatalog } from '../../store/slices/catalogSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { selectSchemaAgreement } from '../../store/selectors';
import { TopicPage } from '../pages/TopicPage';
import topicsFixture from '../../../contracts/artifacts/topics.json';
import type { Topics } from '../../contracts';

const loaded = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadManifest());
  await store.dispatch(loadCatalog());
  return store;
};

/**
 * The schema mismatch, shown.
 *
 * The badge said two services will fail to talk to each other and then declined to say where,
 * leaving the reader to open each service's own spec by hand — a detection with no finding under it.
 * These pin the finding, and pin that it stays a finding rather than becoming an accusation: which
 * declaration is *right* is the reader's judgement, so nothing here may read as "X is missing Y".
 */
describe('the schema agreement view', () => {
  it('names every service and what each one declares for a divergent field', async () => {
    const store = await loaded();
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');

    expect(view.published).toBe(true);
    const request = view.planes.find((p) => p.plane === 'request')!;
    const warehouse = request.root.find((n) => n.name === 'warehouse')!;

    expect(warehouse.agrees).toBe(false);
    const labels = warehouse.variants!.map((v) => `${v.label}: ${v.services.join(',')}`);
    expect(labels).toContain('not declared: payments-api');
    expect(labels.some((l) => l.startsWith('string') && l.includes('shipping-api'))).toBe(true);
  });

  it('renders a field everyone agrees on as an ordinary row, saying nothing', async () => {
    // The whole scaling argument. If agreement cost ink, a five-consumer topic would be unreadable
    // and the disagreement — the only thing worth looking at — would be buried in it.
    const store = await loaded();
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');
    const sku = view.planes[0]!.root.find((n) => n.name === 'sku')!;

    expect(sku.agrees).toBe(true);
    expect(sku.variants).toBeUndefined();
    expect(sku.consensus!.type).toBe('string');
  });

  it('stops walking where the declared types differ, and says so', async () => {
    // Comparing an integer's fields against a string's has no meaning, and reporting "every field
    // removed" beneath one would bury the actual finding under noise.
    const store = await loaded();
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');
    const quantity = view.planes[0]!.root.find((n) => n.name === 'quantity')!;

    expect(quantity.agrees).toBe(false);
    expect(quantity.truncated).toBe(true);
    expect(quantity.children).toEqual([]);
  });

  it('shows a difference the .NET comparer’s taxonomy cannot classify', async () => {
    // maxLength is outside type/format/properties/required/items, so a diff-based artifact would
    // have published "they differ, we cannot say where". This is the case that argued for
    // publishing raw declarations instead.
    const store = await loaded();
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');
    const reference = view.planes[0]!.root.find((n) => n.name === 'reference')!;

    expect(reference.agrees).toBe(false);
    const labels = reference.variants!.map((v) => v.label).join(' | ');
    expect(labels).toContain('12');
    expect(labels).toContain('64');
  });

  it('distinguishes a requiredness disagreement from a presence one', async () => {
    const store = await loaded();
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');
    const note = view.planes[0]!.root.find((n) => n.name === 'note')!;

    expect(note.agrees).toBe(false);
    // Both declare it; they disagree about whether it must be there. Never "not declared".
    expect(note.variants!.every((v) => v.label !== 'not declared')).toBe(true);
    expect(note.variants!.some((v) => v.label.includes('required'))).toBe(true);
  });

  it('counts the fields that differ, so the reader knows the size of the problem', async () => {
    const store = await loaded();
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');
    expect(view.planes[0]!.differCount).toBe(4);
  });

  it('says nothing is known when the catalogue does not publish the declarations', async () => {
    // Absence of the field is an older aggregator, NOT agreement — rendering it as "they agree"
    // would be the absence-as-good-news defect on the one flag that says two services cannot talk.
    const stripped: Topics = {
      ...(topicsFixture as unknown as Topics),
      topics: (topicsFixture as unknown as Topics).topics.map(({ ...t }) => {
        delete (t as { declaredSchemas?: unknown }).declaredSchemas;
        return t;
      }),
    };
    const store = await loaded({ getTopics: async () => stripped });
    const view = selectSchemaAgreement(store.getState(), 'inventory:adjust');

    expect(view.published).toBe(false);
    expect(view.planes).toEqual([]);
  });
});

describe('the topic page in the mismatch state', () => {
  it('shows who declares what, instead of asserting a contract the estate does not have', async () => {
    const store = await loaded();
    render(<Provider store={store}><TopicPage topic="inventory:adjust" /></Provider>);

    const contract = screen.getByRole('heading', { name: 'Contract' }).closest('section')!;
    expect(within(contract).getByText(/do not declare one shape/)).toBeInTheDocument();
    // The divergent fields, with their declarers, in the visible plane.
    expect(within(contract).getAllByText('differs').length).toBeGreaterThan(0);
    expect(within(contract).getByText('not declared')).toBeInTheDocument();
    expect(within(contract).getAllByText(/payments-api/).length).toBeGreaterThan(0);
  });

  it('never says a service is missing a field, only that the declarations differ', async () => {
    // Either declaration could be the correct one. "payments-api is missing warehouse" is a verdict
    // nobody earned, and it is the difference between a finding and an accusation.
    const store = await loaded();
    const { container } = render(<Provider store={store}><TopicPage topic="inventory:adjust" /></Provider>);

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\bmissing\b/i);
    expect(text).not.toMatch(/\bextra\b/i);
    expect(text).toMatch(/yours to decide/);
  });
});
