import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { fleetObserved } from './slices/fleetSlice';
import { failingFlowsToggled, pivotedToFailingFlows } from './slices/viewSlice';
import { selectFlows, selectFlowsForTopic, selectFlowsForService } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';
import { fleetView, fleetTopic, fleetTrace } from '../test/fleetView';

const ok = fleetTrace({ traceId: 'a', topic: 'orders:create', startedAt: '2026-08-09T05:59:00Z' });
const failed = fleetTrace({
  traceId: 'b',
  topic: 'payment:capture',
  services: ['orders-api', 'payments-api'],
  startedAt: '2026-08-09T05:59:40Z',
  failed: true,
});
const unattributed = fleetTrace({ traceId: 'c', startedAt: '2026-08-09T05:58:00Z' });

const ready = (traces = [ok, failed, unattributed], topics = [fleetTopic({ invocations: 10 })]) => {
  const store = createStore(fakeMeshApi());
  store.dispatch(fleetObserved(fleetView({ traces, topics })));
  return store;
};

describe('flows', () => {
  it('is absent entirely when no collector is wired', () => {
    // An empty flow list with no collector would read as "nothing happened", which is a claim.
    const store = createStore(fakeMeshApi());
    expect(selectFlows(store.getState()).available).toBe(false);
  });

  it('lists flows newest first', () => {
    expect(selectFlows(ready().getState()).flows.map((f) => f.traceId)).toEqual(['b', 'a', 'c']);
  });

  it('narrows to failures on the toggle, and keeps the total so the toggle can say what it hides', () => {
    const store = ready();
    store.dispatch(failingFlowsToggled());

    const view = selectFlows(store.getState());
    expect(view.flows.map((f) => f.traceId)).toEqual(['b']);
    expect(view.failing).toBe(1);
    expect(view.total).toBe(3);
  });

  it('does not claim an unattributed flow for any topic', () => {
    // `topic` is optional on the wire: a summary-plane row that mapped no Benzene spans cannot be
    // attributed. Assigning it to a topic to avoid an empty list would be inventing evidence.
    const store = ready();
    expect(selectFlowsForTopic(store.getState(), 'orders:create').flows.map((f) => f.traceId)).toEqual(['a']);
    expect(selectFlowsForTopic(store.getState(), 'payment:capture').flows.map((f) => f.traceId)).toEqual(['b']);
  });

  it('matches a service anywhere in the chain, not only at the entry', () => {
    const store = ready();
    expect(selectFlowsForService(store.getState(), 'payments-api').flows.map((f) => f.traceId)).toEqual(['b']);
    expect(selectFlowsForService(store.getState(), 'orders-api').flows.map((f) => f.traceId)).toEqual(['b', 'a', 'c']);
  });

  it('says when traffic was observed but no flows came back', () => {
    // Flows are sampled and capped, and a counts-only poll asks for none. An empty list is a
    // statement about the plane, not about the estate, and the two must not look the same.
    const store = ready([], [fleetTopic({ invocations: 4820 })]);
    const view = selectFlows(store.getState());
    expect(view.sampledOut).toBe(true);
    expect(view.flows).toEqual([]);
  });

  it('does not cry sampling when the estate was genuinely quiet', () => {
    const store = ready([], [fleetTopic({ invocations: 0 })]);
    expect(selectFlows(store.getState()).sampledOut).toBe(false);
  });

  it('does not read a count from a plane that declares its stats missing as traffic', () => {
    const store = ready([], [fleetTopic({ invocations: 99, missingFeeds: ['stats'] })]);
    expect(selectFlows(store.getState()).sampledOut).toBe(false);
  });
});

describe('the failing-flows pivot', () => {
  it('opens the topic with its failures already showing', () => {
    // The whole point: an error count that cannot be drilled into is a dead end, and a dead end
    // teaches readers to stop looking.
    const store = ready();
    store.dispatch(pivotedToFailingFlows('payment:capture'));

    const view = store.getState().view;
    expect(view.page).toBe('topic');
    expect(view.selected).toBe('payment:capture');
    expect(view.failingFlowsOnly).toBe(true);
    expect(selectFlowsForTopic(store.getState(), 'payment:capture').flows.map((f) => f.traceId)).toEqual(['b']);
  });
});
