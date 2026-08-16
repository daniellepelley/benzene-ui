import { describe, it, expect } from 'vitest';
import { createStore } from './store';
import { loadCatalog } from './slices/catalogSlice';
import { selectFeedErrors } from './selectors';
import { fakeMeshApi } from '../test/fakeMeshApi';

/**
 * "I could not read this feed" and "I read it and it was empty" are different facts, and only the
 * second is a statement about the estate. Collapsing them in a `.catch(() => null)` made a 404 on
 * `topics.json` render as "the aggregator has run but no service declared one" — which sends a
 * reader hunting a registration problem across five services when the answer is a 403 on one URL.
 * A platform engineer had to read source to find out their feed was failing.
 */
describe('an unreadable feed is never reported as an empty estate', () => {
  it('keeps the reason a feed could not be read', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => { throw new Error('404 Not Found'); },
    }));
    await store.dispatch(loadCatalog());

    expect(selectFeedErrors(store.getState())).toEqual([
      { feed: 'topics', message: '404 Not Found' },
    ]);
  });

  it('still loads the feeds that did work', async () => {
    const store = createStore(fakeMeshApi({
      getUsage: async () => { throw new Error('500'); },
    }));
    await store.dispatch(loadCatalog());

    // One missing artifact must not blank the other two — the original instinct, kept.
    expect(store.getState().catalog.topics).not.toBeNull();
    expect(store.getState().catalog.topology).not.toBeNull();
    expect(selectFeedErrors(store.getState()).map((e) => e.feed)).toEqual(['usage']);
  });

  it('reports nothing when every feed reads, however empty', async () => {
    const store = createStore(fakeMeshApi({
      getTopics: async () => ({ generatedAtUtc: '', topics: [], removedTopics: [] } as never),
    }));
    await store.dispatch(loadCatalog());

    // A genuinely empty catalogue is the one case the old sentence was right about.
    expect(selectFeedErrors(store.getState())).toEqual([]);
  });
});
