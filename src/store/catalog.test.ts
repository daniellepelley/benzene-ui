import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { filterChanged } from './slices/viewSlice';
import {
  selectTopics, selectVisibleTopics, selectTrafficForTopic, selectEdgesForService,
  selectTopicsForService, selectFlaggedTopics, isSuccessStatus,
} from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const ready = async () => {
  const store = createStore(fakeMeshApi());
  await store.dispatch(loadCatalog());
  return store;
};

describe('catalog', () => {
  it('loads topics, topology and usage together', async () => {
    const store = await ready();
    expect(store.getState().catalog.load).toBe('ready');
    expect(selectTopics(store.getState()).length).toBeGreaterThan(0);
    expect(store.getState().catalog.topology?.edges.length).toBeGreaterThan(0);
  });

  it('survives one artifact being unavailable', async () => {
    // An aggregator with no usage source still publishes topics and topology. Losing all three
    // because one is missing would blank a working dashboard.
    const store = createStore(
      fakeMeshApi({
        getUsage: async () => {
          throw new Error('no usage source wired');
        },
      }),
    );

    await store.dispatch(loadCatalog());

    expect(store.getState().catalog.load).toBe('ready');
    expect(store.getState().catalog.usage).toBeNull();
    expect(selectTopics(store.getState()).length).toBeGreaterThan(0);
  });

  it('filters topics with the same box that filters services', async () => {
    const store = await ready();
    store.dispatch(filterChanged('orders:'));
    const visible = selectVisibleTopics(store.getState());
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((t) => t.topic.includes('orders:'))).toBe(true);
  });

  it('flags topics the aggregator marked', async () => {
    const store = await ready();
    expect(selectFlaggedTopics(store.getState()).every((t) => t.status != null)).toBe(true);
  });
});

describe('traffic', () => {
  it('splits success from failure by the status vocabulary', async () => {
    const store = await ready();
    const traffic = selectTrafficForTopic(store.getState(), 'orders:get-all');

    expect(traffic.observed).toBe(true);
    expect(traffic.success).toBeGreaterThan(0);
    expect(traffic.failure).toBeGreaterThan(0);
    expect(traffic.total).toBe(traffic.success + traffic.failure);
  });

  it('treats an unknown status as failure, not success', () => {
    // The safe direction: a status added to the vocabulary later must not silently count as OK.
    expect(isSuccessStatus('ok')).toBe(true);
    expect(isSuccessStatus('created')).toBe(true);
    expect(isSuccessStatus('service-unavailable')).toBe(false);
    expect(isSuccessStatus('something-new')).toBe(false);
    expect(isSuccessStatus(null)).toBe(false);
  });

  it('distinguishes "no usage source" from "zero traffic"', async () => {
    // Zero measured traffic is a deprecation candidate. Zero because nothing measures is not a
    // finding at all, and conflating them invents work.
    //
    // The two facts are now separate fields, because one word for both is what let a WIRED feed with
    // no rows for a topic render as "no usage source is wired" — sending a reader to debug a healthy
    // exporter, while another page turned the same absence into retirement evidence.
    const store = await ready();
    const noRows = selectTrafficForTopic(store.getState(), 'topic-that-does-not-exist');
    expect(noRows.observed).toBe(true); // the feed IS wired in this fixture
    expect(noRows.rowsForTopic).toBe(false); // it just said nothing about this topic
    expect(noRows.total).toBe(0);
  });
});

describe('service relationships', () => {
  it('splits edges into inbound and outbound', async () => {
    const store = await ready();
    const edges = selectEdgesForService(store.getState(), 'payments-api');
    expect(edges.inbound.every((e) => e.server === 'payments-api')).toBe(true);
    expect(edges.outbound.every((e) => e.client === 'payments-api')).toBe(true);
  });

  it('splits topics into consumed and produced', async () => {
    const store = await ready();
    const topics = selectTopicsForService(store.getState(), 'orders-api');
    expect(topics.consumes.every((t) => t.consumers.some((c) => c.service === 'orders-api'))).toBe(true);
    expect(topics.produces.every((t) => t.producers.some((p) => p.service === 'orders-api'))).toBe(true);
  });
});
