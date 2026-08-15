import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi } from './estateSlice';

/**
 * The "try it" message composer — pick a target service, a payload version and a transport, edit
 * headers and body, send it, see what comes back.
 *
 * Its own slice because it is a *workflow* rather than an observation: it has a selection, a dirty
 * draft, an in-flight request and a result, none of which describe the estate. Everything a user has
 * typed is here rather than in the form, so switching topic and coming back keeps the message, and
 * "can this be sent" is a selector rather than a condition inside a component.
 */

export type SendState = 'idle' | 'sending' | 'sent' | 'failed' | 'blocked';

/** The raw benzene-message transport is always offered; the rest come from the topic's consumers. */
export const RAW_TRANSPORT = 'raw';

export interface ComposeResult {
  statusCode: string;
  body: string;
  headers: Record<string, string>;
}

/**
 * Thrown by `MeshApi.sendMessage` when the mesh itself refused the dispatch (`Benzene.Mesh.Dispatch`'s
 * `Forbidden`/`bad-request`/`not-found`/`not-implemented` outer envelope statuses) — as opposed to a
 * dispatch that went through and reached the target service, whose own response (however unhappy) is
 * a `ComposeResult`, not an error. The distinction matters to the reader: a `Forbidden` here means a
 * safety gate did its job (most commonly `MeshDispatchGate`'s Production check), not that anything is
 * broken, and the composer must say so rather than rendering it as a generic failure.
 */
export class MeshDispatchBlockedError extends Error {
  constructor(
    message: string,
    /** The outer envelope's status — `forbidden`, `bad-request`, `not-found`, `not-implemented`, ... */
    public readonly statusCode: string,
  ) {
    super(message);
    this.name = 'MeshDispatchBlockedError';
  }
}

export interface ComposeState {
  service: string | null;
  topic: string | null;
  /** Index into the topic's versions, sorted by version string. */
  versionIndex: number;
  transport: string;
  headersJson: string;
  bodyJson: string;
  /** True once the user edits, so re-deriving the example never overwrites their work. */
  dirty: boolean;
  /**
   * The required "I understand this runs the real handler" acknowledgement. Its own field, not
   * component state, per the same rule everything else in this slice follows — and it resets
   * whenever the target or the draft changes, so a stale confirmation can never cover a different
   * send than the one the reader looked at.
   */
  confirmed: boolean;
  send: SendState;
  error: string | null;
  result: ComposeResult | null;
}

const initialState: ComposeState = {
  service: null,
  topic: null,
  versionIndex: 0,
  transport: RAW_TRANSPORT,
  headersJson: '{}',
  bodyJson: '{}',
  dirty: false,
  confirmed: false,
  send: 'idle',
  error: null,
  result: null,
};

export const sendComposed = createAsyncThunk<
  ComposeResult,
  { service: string; topic: string; headers: Record<string, string>; body: string },
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
      action: PayloadAction<{ service: string | null; topic: string; exampleBody: string; transports: string[] }>,
    ) {
      const changingTarget = state.topic !== action.payload.topic || state.service !== action.payload.service;
      state.service = action.payload.service;
      state.topic = action.payload.topic;
      if (changingTarget || !state.dirty) {
        state.versionIndex = 0;
        state.bodyJson = action.payload.exampleBody;
        state.headersJson = '{}';
        state.dirty = false;
        state.confirmed = false;
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
      state.confirmed = false;
    },
    transportSelected(state, action: PayloadAction<string>) {
      state.transport = action.payload;
    },
    bodyEdited(state, action: PayloadAction<string>) {
      state.bodyJson = action.payload;
      state.dirty = true;
      state.confirmed = false;
    },
    headersEdited(state, action: PayloadAction<string>) {
      state.headersJson = action.payload;
      state.dirty = true;
      state.confirmed = false;
    },
    sendConfirmationToggled(state) {
      state.confirmed = !state.confirmed;
    },
    composeReset(state) {
      state.dirty = false;
      state.confirmed = false;
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
        state.confirmed = false;
        state.result = action.payload;
      })
      .addCase(sendComposed.rejected, (state, action) => {
        // A blocked dispatch (most often MeshDispatchGate's Production gate) is not a failure to
        // explain away — it is a safety gate working as intended, and reads very differently: not
        // "something is wrong", but "this deliberately did not happen".
        state.send = action.error.name === 'MeshDispatchBlockedError' ? 'blocked' : 'failed';
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
  sendConfirmationToggled,
  composeReset,
} = composeSlice.actions;
export default composeSlice.reducer;
