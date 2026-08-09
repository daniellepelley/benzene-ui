import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import {
  composeOpened, versionSelected, bodyEdited, headersEdited, transportSelected, sendComposed,
  RAW_TRANSPORT,
} from './slices/composeSlice';
import { selectComposeValidity, selectTransportsForTopic, selectTopicVersions, selectExampleBody } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

const ready = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadCatalog());
  return store;
};

describe('compose', () => {
  it('seeds the body from the topic schema when opened', async () => {
    const store = await ready();
    const topic = 'orders:create';
    const example = selectExampleBody(store.getState(), topic, 0);

    store.dispatch(composeOpened({ topic, exampleBody: example, transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.topic).toBe(topic);
    expect(JSON.parse(store.getState().compose.bodyJson)).toBeTypeOf('object');
  });

  it('does not discard an edited draft when the same topic is reopened', async () => {
    // Re-entering the page must not throw away five minutes of typing.
    const store = await ready();
    store.dispatch(composeOpened({ topic: 'orders:create', exampleBody: '{"a":1}', transports: [RAW_TRANSPORT] }));
    store.dispatch(bodyEdited('{"mine":true}'));

    store.dispatch(composeOpened({ topic: 'orders:create', exampleBody: '{"a":1}', transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.bodyJson).toBe('{"mine":true}');
  });

  it('reseeds when a different topic is opened', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ topic: 'a', exampleBody: '{"a":1}', transports: [RAW_TRANSPORT] }));
    store.dispatch(bodyEdited('{"mine":true}'));

    store.dispatch(composeOpened({ topic: 'b', exampleBody: '{"b":2}', transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.bodyJson).toBe('{"b":2}');
    expect(store.getState().compose.dirty).toBe(false);
  });

  it('reseeds on a version change even when dirty — the old body was for a different schema', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ topic: 'a', exampleBody: '{"v1":1}', transports: [RAW_TRANSPORT] }));
    store.dispatch(bodyEdited('{"edited":true}'));

    store.dispatch(versionSelected({ index: 1, exampleBody: '{"v2":2}' }));

    expect(store.getState().compose.bodyJson).toBe('{"v2":2}');
  });

  it('falls back to the raw transport when the current one is not offered', async () => {
    const store = await ready();
    store.dispatch(transportSelected('http'));

    store.dispatch(composeOpened({ topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.transport).toBe(RAW_TRANSPORT);
  });

  it('will not send invalid JSON', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));
    expect(selectComposeValidity(store.getState()).canSend).toBe(true);

    store.dispatch(bodyEdited('{ not json'));
    expect(selectComposeValidity(store.getState())).toMatchObject({ bodyValid: false, canSend: false });

    store.dispatch(bodyEdited('{}'));
    store.dispatch(headersEdited('nope'));
    expect(selectComposeValidity(store.getState())).toMatchObject({ headersValid: false, canSend: false });
  });

  it('reports a read-only mesh rather than failing silently', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));

    await store.dispatch(sendComposed({ topic: 'a', headers: {}, body: '{}' }));

    expect(store.getState().compose.send).toBe('failed');
    expect(store.getState().compose.error).toContain('read-only');
  });

  it('keeps the response when a send succeeds', async () => {
    const store = await ready({
      sendMessage: async () => ({ statusCode: 'created', body: '{"id":"1"}', headers: {} }),
    });
    store.dispatch(composeOpened({ topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));

    await store.dispatch(sendComposed({ topic: 'a', headers: {}, body: '{}' }));

    expect(store.getState().compose.send).toBe('sent');
    expect(store.getState().compose.result?.statusCode).toBe('created');
  });

  it('always offers the raw transport, and adds http where a consumer maps it', async () => {
    const store = await ready();
    const topic = store.getState().catalog.topics!.topics.find((t) => (t.consumers ?? []).some((c) => (c.httpMappings ?? []).length > 0))!;

    const transports = selectTransportsForTopic(store.getState(), topic.topic);

    expect(transports).toContain(RAW_TRANSPORT);
    expect(transports).toContain('http');
  });

  it('excludes reserved topics from composable versions', async () => {
    // A reserved topic is Benzene's own; composing against it is not a user action.
    const store = await ready();
    const reserved = store.getState().catalog.topics!.topics.find((t) => t.reserved);
    if (reserved) {
      expect(selectTopicVersions(store.getState(), reserved.topic)).toHaveLength(0);
    }
  });
});
