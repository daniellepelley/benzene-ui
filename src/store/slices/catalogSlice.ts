import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';
import type { Topics, Topology, Usage } from '../../contracts';
import type { LoadState } from './estateSlice';

/**
 * The aggregator's published view of the estate's *shape* — what topics exist, who calls whom, and
 * how much traffic each has seen.
 *
 * One slice rather than three because these three artifacts are published together by the same
 * aggregator run, share a `generatedAtUtc`, and are meaningless apart: a topology edge with no usage
 * behind it and a usage row with no topic are both half-answers. They load together and go stale
 * together, which is the test for whether state belongs in one slice.
 */
export interface CatalogState {
  load: LoadState;
  error: string | null;
  topics: Topics | null;
  topology: Topology | null;
  usage: Usage | null;
  /**
   * Which artifacts could not be READ, and why — as distinct from artifacts that were read and were
   * empty.
   *
   * Those are different facts and the product used to throw the distinction away in a
   * `.catch(() => null)`. A 404 on `topics.json` then rendered as *"No topics are published. The
   * aggregator has run but no service declared one."* — a failed fetch presented as an assertion
   * about the reader's estate, on the one screen that estate is judged from. A platform engineer had
   * to read source to find out their feed was 404ing, because nothing in the chrome named it.
   *
   * The live plane already gets this right ("live plane unreachable — no successful poll yet;
   * retrying"). This is the static half held to the same standard.
   */
  feedErrors: Record<string, string>;
}

const initialState: CatalogState = {
  load: 'idle',
  error: null,
  topics: null,
  topology: null,
  usage: null,
  feedErrors: {},
};

/** Reads one artifact, keeping the REASON a read failed rather than collapsing it to absence. */
async function read<T>(
  name: string, fetchIt: () => Promise<T>, errors: Record<string, string>,
): Promise<T | null> {
  try {
    return await fetchIt();
  } catch (e) {
    errors[name] = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export const loadCatalog = createAsyncThunk<
  {
    topics: Topics | null; topology: Topology | null; usage: Usage | null;
    feedErrors: Record<string, string>;
  },
  void,
  { extra: MeshApi }
>('catalog/load', async (_, { extra }) => {
  // Settled, not all: an aggregator may publish topics without usage if no usage source is wired.
  // One missing artifact must not blank the other two — but "missing" and "unreadable" are recorded
  // separately, because only one of them is a statement about the estate.
  const feedErrors: Record<string, string> = {};
  const [topics, topology, usage] = await Promise.all([
    read('topics', () => extra.getTopics(), feedErrors),
    read('topology', () => extra.getTopology(), feedErrors),
    read('usage', () => extra.getUsage(), feedErrors),
  ]);
  return { topics, topology, usage, feedErrors };
});

const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadCatalog.pending, (state) => {
        state.load = 'loading';
        state.error = null;
      })
      .addCase(loadCatalog.fulfilled, (state, action) => {
        state.load = 'ready';
        state.topics = action.payload.topics;
        state.topology = action.payload.topology;
        state.usage = action.payload.usage;
        state.feedErrors = action.payload.feedErrors;
      })
      .addCase(loadCatalog.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'The catalog could not be loaded';
      });
  },
});

export default catalogSlice.reducer;
