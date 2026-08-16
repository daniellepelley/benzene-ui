import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import {
  composeOpened, versionSelected, bodyEdited, headersEdited, transportSelected,
  sendConfirmationToggled, sendComposed, MeshDispatchBlockedError,
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

    store.dispatch(composeOpened({ service: 'orders-api', topic, exampleBody: example, transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.service).toBe('orders-api');
    expect(store.getState().compose.topic).toBe(topic);
    expect(JSON.parse(store.getState().compose.bodyJson)).toBeTypeOf('object');
  });

  it('does not discard an edited draft when the same target is reopened', async () => {
    // Re-entering the page must not throw away five minutes of typing.
    const store = await ready();
    const target = { service: 'orders-api', topic: 'orders:create', exampleBody: '{"a":1}', transports: [RAW_TRANSPORT] };
    store.dispatch(composeOpened(target));
    store.dispatch(bodyEdited('{"mine":true}'));

    store.dispatch(composeOpened(target));

    expect(store.getState().compose.bodyJson).toBe('{"mine":true}');
  });

  it('reseeds when a different topic is opened', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{"a":1}', transports: [RAW_TRANSPORT] }));
    store.dispatch(bodyEdited('{"mine":true}'));

    store.dispatch(composeOpened({ service: 's', topic: 'b', exampleBody: '{"b":2}', transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.bodyJson).toBe('{"b":2}');
    expect(store.getState().compose.dirty).toBe(false);
  });

  it('reseeds when the same topic is reopened against a different service', async () => {
    // The topic could be unambiguous under one producer but the reader is deliberately targeting a
    // different one — that is a new target, not a re-entry of the same one.
    const store = await ready();
    store.dispatch(composeOpened({ service: 's1', topic: 'a', exampleBody: '{"a":1}', transports: [RAW_TRANSPORT] }));
    store.dispatch(bodyEdited('{"mine":true}'));

    store.dispatch(composeOpened({ service: 's2', topic: 'a', exampleBody: '{"b":2}', transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.bodyJson).toBe('{"b":2}');
  });

  it('reseeds on a version change even when dirty — the old body was for a different schema', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{"v1":1}', transports: [RAW_TRANSPORT] }));
    store.dispatch(bodyEdited('{"edited":true}'));

    store.dispatch(versionSelected({ index: 1, exampleBody: '{"v2":2}' }));

    expect(store.getState().compose.bodyJson).toBe('{"v2":2}');
  });

  it('falls back to the raw transport when the current one is not offered', async () => {
    const store = await ready();
    store.dispatch(transportSelected('http'));

    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));

    expect(store.getState().compose.transport).toBe(RAW_TRANSPORT);
  });

  it('will not send without a service, without confirmation, or with invalid JSON', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ service: null, topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));
    expect(selectComposeValidity(store.getState()).canSend).toBe(false);

    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));
    expect(selectComposeValidity(store.getState()).canSend).toBe(false); // not confirmed yet

    store.dispatch(sendConfirmationToggled());
    expect(selectComposeValidity(store.getState()).canSend).toBe(true);

    store.dispatch(bodyEdited('{ not json'));
    expect(selectComposeValidity(store.getState())).toMatchObject({ bodyValid: false, canSend: false });

    store.dispatch(bodyEdited('{}'));
    store.dispatch(headersEdited('nope'));
    expect(selectComposeValidity(store.getState())).toMatchObject({ headersValid: false, canSend: false });
  });

  it('un-confirms when the draft or the target changes, so a stale confirmation never covers a new send', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));
    store.dispatch(sendConfirmationToggled());
    expect(store.getState().compose.confirmed).toBe(true);

    store.dispatch(bodyEdited('{"edited":true}'));
    expect(store.getState().compose.confirmed).toBe(false);
  });

  it('reports a read-only mesh rather than failing silently', async () => {
    const store = await ready();
    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));

    await store.dispatch(sendComposed({ service: 's', topic: 'a', headers: {}, body: '{}' }));

    expect(store.getState().compose.send).toBe('failed');
    expect(store.getState().compose.error).toContain('read-only');
  });

  it('keeps the response when a send succeeds', async () => {
    const store = await ready({
      sendMessage: async () => ({ statusCode: 'created', body: '{"id":"1"}', headers: {} }),
    });
    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));
    store.dispatch(sendConfirmationToggled());

    await store.dispatch(sendComposed({ service: 's', topic: 'a', headers: {}, body: '{}' }));

    expect(store.getState().compose.send).toBe('sent');
    expect(store.getState().compose.result?.statusCode).toBe('created');
    // A completed send clears the acknowledgement — the next one needs its own.
    expect(store.getState().compose.confirmed).toBe(false);
  });

  it('renders a blocked dispatch distinctly from a failed one', async () => {
    // The mesh itself refusing to attempt the send (MeshDispatchGate's Production check, most
    // commonly) is not the same statement as "something went wrong" — it needs its own send state
    // so the composer can say "this is a safety gate working as intended" instead of a generic error.
    const store = await ready({
      sendMessage: async () => {
        throw new MeshDispatchBlockedError('Mesh dispatch is disabled in this environment.', 'forbidden');
      },
    });
    store.dispatch(composeOpened({ service: 's', topic: 'a', exampleBody: '{}', transports: [RAW_TRANSPORT] }));

    await store.dispatch(sendComposed({ service: 's', topic: 'a', headers: {}, body: '{}' }));

    expect(store.getState().compose.send).toBe('blocked');
    expect(store.getState().compose.error).toContain('disabled in this environment');
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

  /**
   * The version picker used to change nothing but the body skeleton. A tester could select v2, send,
   * get a green result, and record "v2 verified" having exercised the target's default version.
   */
  describe('the selected version actually travels with the message', () => {
    const open = (store: ReturnType<typeof createStore>, version: string | null) =>
      store.dispatch(composeOpened({
        service: 'orders-api', topic: 'orders:create', exampleBody: '{}',
        transports: [RAW_TRANSPORT], version,
      }));

    it('seeds benzene-version into the visible headers', async () => {
      const store = await ready();
      open(store, 'v2');
      expect(JSON.parse(store.getState().compose.headersJson)).toEqual({ 'benzene-version': 'v2' });
    });

    it('seeds nothing for a versionless topic, because absent means the default version', async () => {
      const store = await ready();
      open(store, null);
      expect(JSON.parse(store.getState().compose.headersJson)).toEqual({});
    });

    it('retargets the header when the picker moves, keeping other headers', async () => {
      const store = await ready();
      open(store, 'v1');
      store.dispatch(headersEdited('{"benzene-version":"v1","x-correlation-id":"abc"}'));

      store.dispatch(versionSelected({ index: 1, exampleBody: '{}', version: 'v2' }));

      expect(JSON.parse(store.getState().compose.headersJson))
        .toEqual({ 'benzene-version': 'v2', 'x-correlation-id': 'abc' });
    });

    it('updates a differently-cased header in place rather than sending two of them', async () => {
      const store = await ready();
      open(store, 'v1');
      store.dispatch(headersEdited('{"Benzene-Version":"v1"}'));

      store.dispatch(versionSelected({ index: 1, exampleBody: '{}', version: 'v2' }));

      expect(JSON.parse(store.getState().compose.headersJson)).toEqual({ 'Benzene-Version': 'v2' });
    });

    it('leaves half-typed header JSON exactly as typed', async () => {
      const store = await ready();
      open(store, 'v1');
      store.dispatch(headersEdited('{"benzene-version": '));

      store.dispatch(versionSelected({ index: 1, exampleBody: '{}', version: 'v2' }));

      expect(store.getState().compose.headersJson).toBe('{"benzene-version": ');
    });

    it('sends the header it showed', async () => {
      const sent: unknown[] = [];
      const store = await ready({ sendMessage: async (m: unknown) => { sent.push(m); return { statusCode: 'ok' }; } });
      open(store, 'v2');
      await store.dispatch(sendComposed({
        service: 'orders-api', topic: 'orders:create',
        headers: JSON.parse(store.getState().compose.headersJson) as Record<string, string>,
        body: '{}',
      }));

      expect(sent).toHaveLength(1);
      expect((sent[0] as { headers: Record<string, string> }).headers)
        .toEqual({ 'benzene-version': 'v2' });
    });
  });
});

/**
 * A result that outlives the request it describes is not stale UI, it is a falsified evidence
 * artifact. A tester sent v2, got a green result, edited the body and switched the picker to v1, and
 * the screen still showed the green result beside the v1 request — a screenshot indistinguishable
 * from a passing v1 test, on the one surface whose whole job is producing evidence somebody else
 * will trust.
 */
describe('a response never outlives the request it describes', () => {
  const sent = async () => {
    const store = await ready({ sendMessage: async () => ({ statusCode: 'ok', body: '{}', headers: {} }) });
    store.dispatch(composeOpened({
      service: 'orders-api', topic: 'orders:create', exampleBody: '{}',
      transports: [RAW_TRANSPORT], version: 'v1',
    }));
    await store.dispatch(sendComposed({
      service: 'orders-api', topic: 'orders:create', headers: {}, body: '{}',
    }));
    expect(store.getState().compose.result).not.toBeNull();
    return store;
  };

  it('discards it when the body changes', async () => {
    const store = await sent();
    store.dispatch(bodyEdited('{"different":true}'));
    expect(store.getState().compose.result).toBeNull();
  });

  it('discards it when the headers change', async () => {
    const store = await sent();
    store.dispatch(headersEdited('{"x":"y"}'));
    expect(store.getState().compose.result).toBeNull();
  });

  it('discards it when the version changes', async () => {
    const store = await sent();
    store.dispatch(versionSelected({ index: 1, exampleBody: '{}', version: 'v2' }));
    expect(store.getState().compose.result).toBeNull();
  });

  it('discards it when the transport changes', async () => {
    const store = await sent();
    store.dispatch(transportSelected('http'));
    expect(store.getState().compose.result).toBeNull();
  });
});
