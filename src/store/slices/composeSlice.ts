import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';

/**
 * The "try it" message composer — pick a payload version and a transport, edit headers and body,
 * send it, see what comes back.
 *
 * Its own slice because it is a *workflow* rather than an observation: it has a selection, a dirty
 * draft, an in-flight request and a result, none of which describe the estate. Everything a user has
 * typed is here rather than in the form, so switching topic and coming back keeps the message, and
 * "can this be sent" is a selector rather than a condition inside a component.
 */

export type SendState = 'idle' | 'sending' | 'sent' | 'failed';

/** The raw benzene-message transport is always offered; the rest come from the topic's consumers. */
export const RAW_TRANSPORT = 'raw';

export interface ComposeResult {
  statusCode: string;
  body: string;
  headers: Record<string, string>;
}

export interface ComposeState {
  topic: string | null;
  /** Index into the topic's versions, sorted by version string. */
  versionIndex: number;
  transport: string;
  headersJson: string;
  bodyJson: string;
  /** True once the user edits, so re-deriving the example never overwrites their work. */
  dirty: boolean;
  send: SendState;
  error: string | null;
  result: ComposeResult | null;
}

const initialState: ComposeState = {
  topic: null,
  versionIndex: 0,
  transport: RAW_TRANSPORT,
  headersJson: '{}',
  bodyJson: '{}',
  dirty: false,
  send: 'idle',
  error: null,
  result: null,
};

export const sendComposed = createAsyncThunk<
  ComposeResult,
  { topic: string; headers: Record<string, string>; body: string },
  { extra: MeshApi }
>('compose/send', async (message, { extra }) => {
  if (!extra.sendMessage) throw new Error('This mesh has no invoke endpoint — composing is read-only');
  return extra.sendMessage(message);
});

const composeSlice = createSlice({
  name: 'compose',
  initialState,
  reducers: {
    /**
     * Opening a topic seeds the body from its schema. `dirty` guards the reseed: re-entering the
     * same topic must not silently discard a message someone has spent five minutes editing.
     */
    composeOpened(
      state,
      action: PayloadAction<{ topic: string; exampleBody: string; transports: string[] }>,
    ) {
      const changingTopic = state.topic !== action.payload.topic;
      state.topic = action.payload.topic;
      if (changingTopic || !state.dirty) {
        state.versionIndex = 0;
        state.bodyJson = action.payload.exampleBody;
        state.headersJson = '{}';
        state.dirty = false;
        state.send = 'idle';
        state.error = null;
        state.result = null;
      }
      if (!action.payload.transports.includes(state.transport)) {
        state.transport = RAW_TRANSPORT;
      }
    },
    versionSelected(state, action: PayloadAction<{ index: number; exampleBody: string }>) {
      state.versionIndex = action.payload.index;
      // Changing the payload version IS a request for a different skeleton, so this reseeds even
      // when dirty — the previous body was written against a different schema.
      state.bodyJson = action.payload.exampleBody;
      state.dirty = false;
    },
    transportSelected(state, action: PayloadAction<string>) {
      state.transport = action.payload;
    },
    bodyEdited(state, action: PayloadAction<string>) {
      state.bodyJson = action.payload;
      state.dirty = true;
    },
    headersEdited(state, action: PayloadAction<string>) {
      state.headersJson = action.payload;
      state.dirty = true;
    },
    composeReset(state) {
      state.dirty = false;
      state.send = 'idle';
      state.error = null;
      state.result = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendComposed.pending, (state) => {
        state.send = 'sending';
        state.error = null;
        state.result = null;
      })
      .addCase(sendComposed.fulfilled, (state, action) => {
        state.send = 'sent';
        state.result = action.payload;
      })
      .addCase(sendComposed.rejected, (state, action) => {
        state.send = 'failed';
        state.error = action.error.message ?? 'The message could not be sent';
      });
  },
});

export const {
  composeOpened,
  versionSelected,
  transportSelected,
  bodyEdited,
  headersEdited,
  composeReset,
} = composeSlice.actions;
export default composeSlice.reducer;
