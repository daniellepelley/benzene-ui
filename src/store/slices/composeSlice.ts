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

/**
 * The header a Benzene service reads a payload version off.
 *
 * `benzene-version` is the canonical name in the specification's ordered fallback list
 * (`benzene-version` → `version` → `x-version`); it is the one implementations WRITE, so it is the
 * one to write here. See `docs/specification/versioning.md` §2.
 */
const VERSION_HEADER = 'benzene-version';

/**
 * Seeds the headers a version selection implies, VISIBLY, in the editable headers box.
 *
 * The version picker used to change nothing but the body skeleton: the dispatch carried
 * `{service, topic, headers, body}` and no version at all, so the message was routed to whatever the
 * target treats as its default. A tester could select v2, send, get a green result, and record "v2
 * verified" — having exercised v1. That is not a missing feature, it is a green light for something
 * that never happened, which is the one class of defect a sign-off surface cannot have.
 *
 * Seeded into the visible textarea rather than injected at send time on purpose. Everything else on
 * this screen shows the reader exactly what will be sent; a header that appears only in flight would
 * be the one thing on the page they cannot check, on the one screen whose entire job is producing
 * evidence. It also stays editable, which matters because a service may be configured to read a
 * different header name (the fallback list is configurable per §2.1) and the tester needs to be able
 * to say so.
 *
 * A versionless topic seeds nothing: per §2.2 an absent version header means "the topic's default
 * version", which is exactly right, and writing `benzene-version: null` would be worse than silence.
 */
function seedHeaders(version: string | null): string {
  return version ? `${JSON.stringify({ [VERSION_HEADER]: version }, null, 2)}` : '{}';
}

/**
 * Retargets the version header when the picker moves, preserving whatever else the tester has typed.
 *
 * Matches case-insensitively and writes back to the key that is already there, because a tester who
 * typed `Benzene-Version` must not end up sending two version headers that disagree. Where no
 * version header is present at all it adds the canonical one — the picker is labelled "version", so
 * moving it has to actually change the version, or it is decorative again.
 *
 * Unparseable JSON is left exactly as typed. The composer already refuses to send it, and rewriting
 * a half-finished edit under the cursor is its own kind of hostile.
 */
function retargetVersionHeader(headersJson: string, version: string | null): string {
  let parsed: Record<string, unknown>;
  try {
    const candidate: unknown = JSON.parse(headersJson);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return headersJson;
    parsed = candidate as Record<string, unknown>;
  } catch {
    return headersJson;
  }

  const existing = Object.keys(parsed).find((k) => k.toLowerCase() === VERSION_HEADER);
  if (!version) {
    if (!existing) return headersJson;
    delete parsed[existing];
    return JSON.stringify(parsed, null, 2);
  }
  // Only seed a NEW header into a headers block the tester has not versioned themselves; if they
  // already carry one under any casing, update that key in place rather than adding a second.
  parsed[existing ?? VERSION_HEADER] = version;
  return JSON.stringify(parsed, null, 2);
}

/** Drops a response that no longer describes what is on screen. See `bodyEdited`. */
function discardResult(state: ComposeState): void {
  state.result = null;
  state.error = null;
  state.send = 'idle';
}

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
      action: PayloadAction<{
        service: string | null; topic: string; exampleBody: string; transports: string[];
        /**
         * Which version the reader arrived from, as an index into `versions`.
         *
         * Defaulting to 0 sent them to the OLDEST version's skeleton: arriving from a v2 topic page
         * and pressing compose produced a v1 body, including fields v2 had deleted. The one screen
         * that exists to send a correctly-shaped message was seeding the wrong shape, silently.
         */
        versionIndex?: number;
        /** The label of that version, so the dispatch can actually ask for it. See `seedHeaders`. */
        version?: string | null;
      }>,
    ) {
      const changingTarget = state.topic !== action.payload.topic || state.service !== action.payload.service;
      state.service = action.payload.service;
      state.topic = action.payload.topic;
      if (changingTarget || !state.dirty) {
        state.versionIndex = action.payload.versionIndex ?? 0;
        state.bodyJson = action.payload.exampleBody;
        state.headersJson = seedHeaders(action.payload.version ?? null);
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
    versionSelected(
      state,
      action: PayloadAction<{ index: number; exampleBody: string; version?: string | null }>,
    ) {
      state.versionIndex = action.payload.index;
      discardResult(state);
      // Changing the payload version IS a request for a different skeleton, so this reseeds even
      // when dirty — the previous body was written against a different schema.
      state.bodyJson = action.payload.exampleBody;
      state.headersJson = retargetVersionHeader(state.headersJson, action.payload.version ?? null);
      state.dirty = false;
      state.confirmed = false;
    },
    transportSelected(state, action: PayloadAction<string>) {
      state.transport = action.payload;
      discardResult(state);
    },
    /*
     * Editing the request DISCARDS the previous response, on every path.
     *
     * A result that outlives the request it describes is not stale UI, it is a falsified evidence
     * artifact: a tester sent v2, got a green result, edited the body and switched to v1, and the
     * screen still showed the green result beside the v1 request. A screenshot at that moment is
     * indistinguishable from a passing v1 test, and the whole point of this surface is producing
     * evidence somebody else will trust.
     */
    bodyEdited(state, action: PayloadAction<string>) {
      state.bodyJson = action.payload;
      state.dirty = true;
      state.confirmed = false;
      discardResult(state);
    },
    headersEdited(state, action: PayloadAction<string>) {
      state.headersJson = action.payload;
      state.dirty = true;
      state.confirmed = false;
      discardResult(state);
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
