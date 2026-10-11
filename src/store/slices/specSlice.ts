import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { MeshApi, LoadState } from './estateSlice';
import type { ServiceSpec } from '../../contracts';
import { asWireResponse, problemMessage, successOf } from '../../data/envelope';
import { readContractDocument } from '../../contracts/contractDocument';

/**
 * One service's own spec document — what it says it can do, in its own words.
 *
 * A different artifact from anything in `catalog`, and deliberately its own slice: the catalog is
 * the aggregator's *cross-service* view, assembled by someone else, while this is the single
 * service's self-description fetched on demand. They have different sources, different lifetimes and
 * different failure modes, which is the same test that keeps `estate` and `fleet` apart.
 */
export interface SpecState {
  load: LoadState;
  error: string | null;
  /** The service the loaded spec belongs to, so a stale render can be told from a fresh one. */
  service: string | null;
  /**
   * What the service published, as published — either document shape (`contracts/contractDocument.ts`
   * reads both). Store the contract, not a reading of it: the selectors derive the reading.
   */
  spec: ServiceSpec | null;
  /** Which operation the reader has opened. View state, so deep links and tests both work. */
  expanded: string[];
}

const initialState: SpecState = {
  load: 'idle',
  error: null,
  service: null,
  spec: null,
  expanded: [],
};

/**
 * Admits a parsed document to the slice, or refuses it with a reason.
 *
 * The Contract Document's one hard rule for a consumer: a `schemaDialect` it does not know is
 * rejected (contract-document.md §1), never rendered — every schema in it would be misread. A
 * document of either known shape is stored as published; anything else unfamiliar is stored too, and
 * the reader shows what it can of it.
 */
const admitted = (source: string, document: unknown): ServiceSpec => {
  try {
    readContractDocument(document);
  } catch (error) {
    throw new Error(`${source} published a spec this viewer cannot read: ${(error as Error).message}`);
  }
  return document as ServiceSpec;
};

/**
 * The spec comes from the service snapshot the aggregator already stored, not from the service.
 *
 * That is the whole reason this page exists: the service serves JSON and only JSON, and the spec
 * viewer renders what the aggregator captured into the same origin. A UI that fetched the service
 * directly would need CORS on every service in the estate.
 */
export const loadSpec = createAsyncThunk<
  { service: string; spec: ServiceSpec | null },
  string,
  { extra: MeshApi }
>('spec/load', async (service, { extra }) => {
  const snapshot = await extra.getService(service);
  if (!snapshot.specJson) return { service, spec: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshot.specJson) as unknown;
  } catch {
    // The aggregator stores whatever the service published, verbatim. A service serving YAML, or
    // HTML from a misrouted proxy, is a legible failure — not a crash.
    throw new Error(`${service} published a spec that is not JSON`);
  }
  return { service, spec: admitted(service, parsed) };
});

/**
 * The standalone path: a spec document fetched straight from a URL.
 *
 * The same viewer serves both. In the mesh it reads the aggregator's stored snapshot, so the service
 * never has to serve HTML or open CORS; pointed at a URL it renders any conforming spec document —
 * a file on disk, a service's own `GET /benzene/spec?type=benzene` (the `benzene:spec` topic's
 * default route), a build artifact in CI. One page, because the *reading* is identical and only the
 * fetch differs, and two pages would drift.
 *
 * The body is read whatever the status, by the same rules as every other Benzene answer
 * (`data/envelope.ts`): a saved or relayed response *envelope* is unwrapped and judged by its own
 * `isSuccessful`, and a failure says why — the problem document's `detail` (`not-implemented` for a
 * `type` or `format` the service does not serve, wire-contracts §7) — rather than only a status line.
 */
export const loadSpecFromUrl = createAsyncThunk<{ service: string; spec: ServiceSpec | null }, string>(
  'spec/loadFromUrl',
  async (url) => {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const text = await response.text().catch(() => '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = undefined;
    }

    const envelope = asWireResponse(parsed);
    if (envelope) {
      if (successOf(envelope) !== true) {
        const reason = problemMessage(envelope.body);
        throw new Error(`The spec request answered ${envelope.statusCode || 'without a status'}${reason ? `: ${reason}` : ''}`);
      }
      parsed = JSON.parse(envelope.body || 'null') as unknown;
    } else if (!response.ok) {
      // Only a JSON problem document gives a reason; an HTML error page's markup is not one.
      const reason = parsed === undefined ? null : problemMessage(text);
      throw new Error(`${response.status} ${response.statusText} fetching the spec${reason ? `: ${reason}` : ''}`);
    }

    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${url} did not answer with a JSON spec document`);
    }
    const spec = admitted(url, parsed);
    return { service: readContractDocument(spec).service ?? url, spec };
  },
);

const specSlice = createSlice({
  name: 'spec',
  initialState,
  reducers: {
    operationToggled(state, action: PayloadAction<string>) {
      const at = state.expanded.indexOf(action.payload);
      if (at === -1) state.expanded.push(action.payload);
      else state.expanded.splice(at, 1);
    },
    allOperationsCollapsed(state) {
      state.expanded = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSpec.pending, (state) => {
        state.load = 'loading';
        state.error = null;
      })
      .addCase(loadSpec.fulfilled, (state, action) => {
        state.load = 'ready';
        state.service = action.payload.service;
        state.spec = action.payload.spec;
        // A new service is a new document; carrying the old one's open operations across would
        // expand whatever happened to share an index.
        state.expanded = [];
      })
      .addCase(loadSpec.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'The spec could not be loaded';
        state.spec = null;
      })
      // Same states, different fetch — the reducer cannot tell, and should not have to.
      .addCase(loadSpecFromUrl.pending, (state) => {
        state.load = 'loading';
        state.error = null;
      })
      .addCase(loadSpecFromUrl.fulfilled, (state, action) => {
        state.load = 'ready';
        state.service = action.payload.service;
        state.spec = action.payload.spec;
        state.expanded = [];
      })
      .addCase(loadSpecFromUrl.rejected, (state, action) => {
        state.load = 'failed';
        state.error = action.error.message ?? 'The spec could not be loaded';
        state.spec = null;
      });
  },
});

export const { operationToggled, allOperationsCollapsed } = specSlice.actions;
export default specSlice.reducer;
