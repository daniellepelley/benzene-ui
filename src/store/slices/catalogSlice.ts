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
}

const initialState: CatalogState = {
  load: 'idle',
  error: null,
  topics: null,
  topology: null,
  usage: null,
};

export const loadCatalog = createAsyncThunk<
  { topics: Topics | null; topology: Topology | null; usage: Usage | null },
  void,
  { extra: MeshApi }
>('catalog/load', async (_, { extra }) => {
  // Settled, not all: an aggregator may publish topics without usage if no usage source is wired.
  // One missing artifact must not blank the other two.
  const [topics, topology, usage] = await Promise.all([
    extra.getTopics().catch(() => null),
    extra.getTopology().catch(() => null),
    extra.getUsage().catch(() => null),
  ]);
  return { topics, topology, usage };
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
      })
      .addCase(loadCatalog.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'The catalog could not be loaded';
      });
  },
});

export default catalogSlice.reducer;
