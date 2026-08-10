import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { topicFilterChanged, topicSorted, utilityToggled, sectionToggled } from './slices/viewSlice';
import { selectCatalogRows, selectCatalogTotal, selectTopicSort, selectIsCollapsed } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const ready = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadCatalog());
  return store;
};

const topicsIn = (store: Awaited<ReturnType<typeof ready>>) =>
  selectCatalogRows(store.getState()).map((r) => r.topic);

describe('the topics catalog', () => {
  it('lists every domain topic, which is the map the estate page never had', async () => {
    // The front door showed only *flagged* topics, so "what do these services actually do" — the
    // product's first question — could only be answered by opening each service in turn.
    const store = await ready();
    expect(topicsIn(store).length).toBeGreaterThan(1);
    expect(topicsIn(store)).toContain('orders:create');
  });

  it('holds benzene utilities back until asked, like every other surface', async () => {
    const store = await ready();
    expect(selectCatalogRows(store.getState()).some((r) => r.reserved)).toBe(false);

    store.dispatch(utilityToggled());
    expect(selectCatalogRows(store.getState()).some((r) => r.reserved)).toBe(true);
  });

  it('carries producers, consumers and HTTP routes per topic', async () => {
    const store = await ready();
    const row = selectCatalogRows(store.getState()).find((r) => r.topic === 'orders:create');

    expect(row?.consumers).toContain('orders-api');
    expect(row?.httpMappings.length).toBeGreaterThan(0);
  });

  it('filters on service names as well as topic names', async () => {
    // "What does payments-api touch" is the same question asked of this table, and requiring the
    // reader to know the topic name first defeats the point of having a map.
    const store = await ready();
    store.dispatch(topicFilterChanged('payments-api'));

    const rows = selectCatalogRows(store.getState());
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((r) => [...r.producers, ...r.consumers].some((s) => s.includes('payments-api'))),
    ).toBe(true);
  });

  it('reports the unfiltered total, so a filtered table is not mistaken for the estate', async () => {
    const store = await ready();
    const total = selectCatalogTotal(store.getState());
    store.dispatch(topicFilterChanged('legacy'));

    expect(selectCatalogRows(store.getState()).length).toBeLessThan(total);
    expect(selectCatalogTotal(store.getState())).toBe(total);
  });

  it('leaves traffic unknown rather than zero when nothing is measuring', async () => {
    // Sorting by a column of invented zeroes would tell a reader the whole estate is unused.
    const store = await ready({
      getUsage: async () => {
        throw new Error('no usage source wired');
      },
    });

    expect(selectCatalogRows(store.getState()).every((r) => r.traffic === null)).toBe(true);
  });

  it('measures traffic when a feed is wired', async () => {
    const store = await ready();
    const row = selectCatalogRows(store.getState()).find((r) => r.topic === 'orders:create');
    expect(row?.traffic).toBeGreaterThan(0);
  });
});

describe('catalog sorting', () => {
  it('starts on traffic, descending — the busiest topic is the one most often wanted', async () => {
    const store = await ready();
    expect(selectTopicSort(store.getState())).toEqual({ key: 'traffic', direction: 'desc' });
  });

  it('flips direction when the active column is clicked again', async () => {
    const store = await ready();
    store.dispatch(topicSorted('traffic'));
    expect(selectTopicSort(store.getState())).toEqual({ key: 'traffic', direction: 'asc' });
  });

  it('switches column descending first, rather than inheriting the last direction', async () => {
    const store = await ready();
    store.dispatch(topicSorted('traffic')); // now ascending
    store.dispatch(topicSorted('topic'));
    expect(selectTopicSort(store.getState())).toEqual({ key: 'topic', direction: 'desc' });
  });

  it('survives navigating away and back, because it is state', async () => {
    const store = await ready();
    store.dispatch(topicSorted('consumers'));
    await store.dispatch(loadCatalog());
    expect(selectTopicSort(store.getState()).key).toBe('consumers');
  });
});

describe('collapsible sections', () => {
  it('remembers what a reader put away', async () => {
    const store = await ready();
    expect(selectIsCollapsed(store.getState(), 'topology')).toBe(false);

    store.dispatch(sectionToggled('topology'));
    expect(selectIsCollapsed(store.getState(), 'topology')).toBe(true);
  });
});
