import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { utilityToggled } from './slices/viewSlice';
import { selectRetirementView, selectVersionCompatibility, selectHttpMappingsForTopic } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';
import topics from '../../contracts/artifacts/topics.json';
import versioned from '../../contracts/artifacts/topics.versioned.json';
import type { Topics, Usage } from '../contracts';

const ready = async (over = {}) => {
  const store = createStore(fakeMeshApi(over));
  await store.dispatch(loadCatalog());
  return store;
};

const tierOf = (store: ReturnType<typeof createStore>, topic: string) => {
  const view = selectRetirementView(store.getState());
  return view.groups.find((g) => g.rows.some((r) => r.entry.topic === topic))?.tier ?? null;
};

const rowFor = (store: ReturnType<typeof createStore>, topic: string) =>
  selectRetirementView(store.getState())
    .groups.flatMap((g) => g.rows)
    .find((r) => r.entry.topic === topic);

describe('the value view', () => {
  it('ranks a topic with no consumers and no observed traffic as a retirement candidate', async () => {
    const store = await ready();
    expect(tierOf(store, 'order:legacy-export')).toBe('candidate');
  });

  it('carries the evidence for its own tier, so the row can be argued with', async () => {
    const store = await ready();
    const row = rowFor(store, 'order:legacy-export');
    expect(row?.evidence).toContain('no declared consumers');
    expect(row?.evidence).toContain('no traffic observed while the usage feed is wired');
  });

  it('never claims a topic is unused when nothing is measuring it', async () => {
    // The distinction the whole view turns on. With no usage feed, "no traffic" is not an
    // observation, and a UI that ranked on it would be recommending outages.
    const store = await ready({
      getUsage: async () => {
        throw new Error('no usage source wired');
      },
    });

    const view = selectRetirementView(store.getState());
    expect(view.feedWired).toBe(false);
    expect(rowFor(store, 'order:legacy-export')?.usageTotal).toBeNull();
    // Structural evidence still stands — this one genuinely has no declared consumers.
    expect(rowFor(store, 'order:legacy-export')?.evidence).toEqual(['no declared consumers']);
  });

  it('keeps a topic with declared consumers out of the candidate tier when it cannot be measured', async () => {
    const store = await ready({
      getUsage: async () => {
        throw new Error('no usage source wired');
      },
    });

    expect(tierOf(store, 'orders:create')).toBe('ok');
    expect(rowFor(store, 'orders:create')?.evidence).toEqual([
      'declared consumers, no usage feed to check against',
    ]);
  });

  it('sends a gap topic to verify-externally rather than to candidates', async () => {
    // Produced outside this fleet: our own declarations cannot prove anything about it, so the
    // honest instruction is "go and ask", not "retire it".
    const gapTopics: Topics = {
      ...(topics as Topics),
      topics: [
        ...(topics as Topics).topics,
        {
          topic: 'partner:settlement',
          version: 'v1',
          reserved: false,
          consumers: [{ service: 'billing-api', httpMappings: [] }],
          producers: [],
          status: 'gap',
          requestSchema: null,
          responseSchema: null,
          messageSchema: null,
          schemaMismatch: false,
        },
      ],
    };
    const store = await ready({ getTopics: async () => gapTopics });

    expect(tierOf(store, 'partner:settlement')).toBe('verify');
    expect(rowFor(store, 'partner:settlement')?.evidence).toContain('produced outside this fleet (gap)');
  });

  it('floats the least-used topics to the top of their tier', async () => {
    const store = await ready();
    for (const group of selectRetirementView(store.getState()).groups) {
      const totals = group.rows.map((r) => r.usageTotal ?? -1);
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
    }
  });

  it('excludes reserved topics entirely — retiring benzene plumbing is not a decision on offer', async () => {
    const store = await ready();
    const all = selectRetirementView(store.getState()).groups.flatMap((g) => g.rows);
    expect(all.some((r) => r.entry.reserved)).toBe(false);
  });

  it('reports removed topics as a past-tense fact, never as a live proposal', async () => {
    const store = await ready();
    const view = selectRetirementView(store.getState());
    expect(view.removed).toEqual([{ topic: 'order:export', version: 'v0' }]);
    // Removed topics are not in any tier — they are gone, not candidates.
    expect(view.groups.flatMap((g) => g.rows).some((r) => r.entry.topic === 'order:export')).toBe(false);
  });

  it('hides removed utility topics until the reader asks for them', async () => {
    const withUtilityRemoval: Topics = {
      ...(topics as Topics),
      removedTopics: [...(topics as Topics).removedTopics, { topic: 'benzene:spec', version: '' }],
    };
    const store = await ready({ getTopics: async () => withUtilityRemoval });

    expect(selectRetirementView(store.getState()).removed).toHaveLength(1);
    store.dispatch(utilityToggled());
    expect(selectRetirementView(store.getState()).removed).toHaveLength(2);
  });

  it('counts a versionless usage row toward every version of its topic', async () => {
    // A feed whose backend cannot discriminate versions still proves the topic is used. Ignoring
    // those rows would manufacture retirement candidates out of a reporting limitation.
    const usage: Usage = {
      generatedAtUtc: '2026-08-09T06:00:00Z',
      windowStartUtc: '2026-08-08T06:00:00Z',
      windowEndUtc: '2026-08-09T06:00:00Z',
      entries: [
        {
          topic: 'order:legacy-export',
          version: null,
          service: null,
          transport: null,
          status: 'ok',
          count: 91,
          avgDurationMs: null,
          source: 'test',
        },
      ],
    };
    const store = await ready({ getUsage: async () => usage });

    expect(rowFor(store, 'order:legacy-export')?.usageTotal).toBe(91);
    expect(tierOf(store, 'order:legacy-export')).toBe('ok');
  });
});

describe('version compatibility', () => {
  it('is absent for a topic the aggregator did not reconcile', async () => {
    // Absent is not "compatible". A green badge on a check nobody ran is an invented reassurance.
    // order:legacy-export exists at one version, so the aggregator emits no entry for it at all —
    // there is no cross-version question to answer.
    const store = await ready();
    expect(selectVersionCompatibility(store.getState(), 'order:legacy-export')).toBeNull();
  });

  it('reports a produced-but-unconsumed version as an incompatibility', async () => {
    const store = await ready({ getTopics: async () => versioned as Topics });
    const vc = selectVersionCompatibility(store.getState(), 'payment:capture');
    expect(vc?.isCompatible).toBe(false);
    expect(vc?.producedNotConsumed).toEqual(['v2']);
  });

  it('does not call a stale handler an incompatibility', async () => {
    // Consumed-but-not-produced is a handler left behind or a version retiring — worth showing,
    // but nothing is at risk, so it must not flip the compatible flag.
    const store = await ready({ getTopics: async () => versioned as Topics });
    const vc = selectVersionCompatibility(store.getState(), 'shipping:book');
    expect(vc?.isCompatible).toBe(true);
    expect(vc?.consumedNotProduced).toEqual(['v1']);
  });
});

describe('http mappings', () => {
  it('collects the routes every version of a topic is exposed on', async () => {
    const store = await ready({ getTopics: async () => versioned as Topics });
    expect(selectHttpMappingsForTopic(store.getState(), 'payment:capture')).toEqual([
      { service: 'payments-api', method: 'POST', path: '/payments/capture' },
    ]);
  });

  it('is empty for a topic with no HTTP binding, rather than inventing one', async () => {
    const store = await ready({ getTopics: async () => versioned as Topics });
    expect(selectHttpMappingsForTopic(store.getState(), 'shipping:book')).toEqual([]);
  });
});
