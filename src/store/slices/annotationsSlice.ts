import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';
import type { LoadState } from './estateSlice';

/**
 * Discussion threads against an entity (`topic:orders:create`, `service:payments-api`).
 *
 * Its own slice because it is the only read-*write* data in the UI: everything else is a published
 * artifact the dashboard observes, while this is something a human adds. That difference brings
 * submission state, optimistic display and failure-to-post, none of which belong anywhere near the
 * artifact slices.
 */
export interface Annotation {
  id: string;
  entity: string;
  author: string;
  text: string;
  createdAtUtc: string;
}

export type PostState = 'idle' | 'posting' | 'failed';

export interface AnnotationsState {
  load: LoadState;
  error: string | null;
  items: Annotation[];
  post: PostState;
  postError: string | null;
  /** What the composer currently holds. View state, so it lives in the store like all of it. */
  draft: string;
  draftAuthor: string;
}

const initialState: AnnotationsState = {
  load: 'idle',
  error: null,
  items: [],
  post: 'idle',
  postError: null,
  draft: '',
  draftAuthor: '',
};

export const loadAnnotations = createAsyncThunk<Annotation[], void, { extra: MeshApi }>(
  'annotations/load',
  async (_, { extra }) => (extra.getAnnotations ? extra.getAnnotations() : []),
);

export const postAnnotation = createAsyncThunk<
  Annotation,
  { entity: string; author: string; text: string },
  { extra: MeshApi }
>('annotations/post', async (request, { extra }) => {
  if (!extra.postAnnotation) throw new Error('This mesh is read-only — no annotation endpoint');
  return extra.postAnnotation(request);
});

const annotationsSlice = createSlice({
  name: 'annotations',
  initialState,
  reducers: {
    draftChanged(state, action: PayloadAction<string>) {
      state.draft = action.payload;
    },
    draftAuthorChanged(state, action: PayloadAction<string>) {
      state.draftAuthor = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAnnotations.pending, (state) => {
        state.load = 'loading';
      })
      .addCase(loadAnnotations.fulfilled, (state, action) => {
        state.load = 'ready';
        state.items = action.payload;
      })
      .addCase(loadAnnotations.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'Annotations could not be loaded';
      })
      .addCase(postAnnotation.pending, (state) => {
        state.post = 'posting';
        state.postError = null;
      })
      .addCase(postAnnotation.fulfilled, (state, action) => {
        state.post = 'idle';
        state.items.push(action.payload);
        // Only clear the draft once the post has actually landed — clearing optimistically loses
        // what someone typed if the endpoint is read-only or the network drops.
        state.draft = '';
      })
      .addCase(postAnnotation.rejected, (state, action) => {
        state.post = 'failed';
        state.postError = action.error.message ?? 'The annotation could not be posted';
      });
  },
});

export const { draftChanged, draftAuthorChanged } = annotationsSlice.actions;
export default annotationsSlice.reducer;
