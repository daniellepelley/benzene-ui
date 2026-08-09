import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { loadAnnotations, postAnnotation, draftChanged, draftAuthorChanged } from './slices/annotationsSlice';
import { filterChanged } from './slices/viewSlice';
import {
  selectTopics, selectVisibleTopics, selectTrafficForTopic, selectEdgesForService,
  selectTopicsForService, selectFlaggedTopics, selectThread, selectCanPost, isSuccessStatus,
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
    const store = await ready();
    const unmeasured = selectTrafficForTopic(store.getState(), 'topic-that-does-not-exist');
    expect(unmeasured.observed).toBe(false);
    expect(unmeasured.total).toBe(0);
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

describe('annotations', () => {
  it('groups a thread by entity, oldest first', async () => {
    const store = createStore(fakeMeshApi());
    await store.dispatch(loadAnnotations());

    const thread = selectThread(store.getState(), 'topic:order:legacy-export');
    expect(thread.length).toBeGreaterThan(1);
    const times = thread.map((a) => Date.parse(a.createdAtUtc));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('will not post an empty note', () => {
    const store = createStore(fakeMeshApi());
    expect(selectCanPost(store.getState())).toBe(false);
    store.dispatch(draftChanged('   '));
    expect(selectCanPost(store.getState())).toBe(false);
    store.dispatch(draftChanged('a real note'));
    expect(selectCanPost(store.getState())).toBe(true);
  });

  it('keeps the draft when a post fails', async () => {
    // Losing what someone typed because the endpoint is read-only is the worst possible response.
    const store = createStore(fakeMeshApi());
    store.dispatch(draftChanged('worth keeping'));
    store.dispatch(draftAuthorChanged('Dani'));

    await store.dispatch(postAnnotation({ entity: 'topic:x', author: 'Dani', text: 'worth keeping' }));

    expect(store.getState().annotations.post).toBe('failed');
    expect(store.getState().annotations.postError).toContain('read-only');
    expect(store.getState().annotations.draft).toBe('worth keeping');
  });

  it('clears the draft only once the post lands', async () => {
    const store = createStore(
      fakeMeshApi({
        postAnnotation: async (r) => ({ id: 'new', createdAtUtc: '2026-07-16T10:00:00Z', ...r }),
      }),
    );
    store.dispatch(draftChanged('posted'));

    await store.dispatch(postAnnotation({ entity: 'topic:x', author: 'Dani', text: 'posted' }));

    expect(store.getState().annotations.draft).toBe('');
    expect(selectThread(store.getState(), 'topic:x')).toHaveLength(1);
  });
});
