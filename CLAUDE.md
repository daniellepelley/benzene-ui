# benzene-ui — guide for AI coding agents

React component library for the Benzene Mesh UI. See `README.md` for the full picture; this file is
the short version of what must not be broken.

## The rule that governs everything

**Components hold no state. The UI is a function of the Redux store.**

- No `useState`, `useReducer`, or refs standing in for state, anywhere under `src/components/`.
- View state — expansion, filters, current page, selected entity, time range — lives in `viewSlice`,
  not in a component. If you are reaching for `useState`, the state belongs in a slice.
- The only permitted effect is in `App.tsx` (the composition root), to start the initial load.
- `src/components/containers/` is the only place `useAppSelector`/`useAppDispatch` may appear.
  Everything in `primitives/` and `controls/` takes props and renders.

## Testing

**Test the store, not the DOM.** A behaviour test is `dispatch(action)` then an assertion on a
selector. Container tests exist only to prove the rendering follows the store — they dispatch
actions and assert on output, never simulate clicks to drive state.

## The build target is one self-contained file

`dist/index.html` inlines all JS and CSS and makes **zero external requests**. `Benzene.Mesh.Ui`
embeds it and serves it from inside a running service — no CDN, no static hosting. CI asserts this.
Consequences: no code splitting, no dynamic import, no runtime CDN anything, and bundle size is a
budget (currently 279 KB for the mesh UI, up from 250 KB with the Test Console's addition, and
218 KB for the spec viewer, against the 274 KB and 955-line hand-written pages they replace).

## The collector is a Benzene service, not a REST API

Every query to it is a message on a topic, inside the wire envelope: `POST {topic, headers, body}`
where `body` is a JSON *string*, answered by `{statusCode, body}` where that is a JSON string too. A
non-`ok` status is an application failure carried in a 200. The window is sent in the wire's
relative-time grammar (`now-15m`), never as a resolved instant — the server resolves it against its
own clock, so a skewed client still asks for the window it means.

## Contracts

`src/contracts/generated.ts` is **generated** — `npm run generate:contracts`. Never edit it.

Types are inferred from the sample artifacts in `contracts/artifacts/`, vendored from the spec repo
and pinned by `contracts/SPEC_VERSION`. The spec's conformance fixtures are *test cases*, not JSON
Schema, so there is nothing to compile a type from directly — inference from real payloads is the
honest substitute, and it makes a shape change show up as a diff on the generated file.

**Widen a type by adding a sample, never by editing.** Every `<stem>*.json` in `contracts/artifacts/`
is merged, so `manifest.minimal.json` beside `manifest.json` is how a field becomes optional. Editing
the generated file is silently reverted by the next run.

Inference gives structure, not meaning: it produces `status: string`, never the union. Vocabularies
are spec decisions and live in `src/contracts/mesh.ts`, pinned to the generated shapes by
`contracts.test.ts`.

**A sample may be forward-looking**, when the spec normatively defines a field no port's aggregator
projects yet: `topics.liveness.json`/`topology.liveness.json` (mesh.md §4.2's declared-vs-observed
liveness signal) are the precedent — the field stays optional (so every selector/component degrades
to today's rendering when it's absent, never fabricating a value), and the "as of `SPEC_VERSION`,
no aggregator emits this yet" fact is stated where the field is interpreted (`src/contracts/mesh.ts`),
not left implicit.

## Two pages, one library

`npm run build` produces **two** self-contained files, from two entries:

- `dist/index.html` → `build/mesh-ui.html` — the estate view.
- `dist/spec/spec.html` → `build/mesh-spec-ui.html` — one service's contract. The same artifact
  serves `Benzene.Mesh.Ui`'s per-service spec view, `Benzene.Spec.Ui`'s standalone viewer, and the
  website demo, because the *reading* is identical and only the fetch differs: `?service=` reads the
  aggregator's stored snapshot, `?url=`/`data-spec-url`/`./spec.json` fetches a document. Two pages
  for that would drift, and the two they replaced had.

Separate builds rather than two entries in one, because `vite-plugin-singlefile` inlines a whole
build into a page — two entries in one build inline each other's code into both.

## State slices

Eight, and the separation is load-bearing:

- `estate` — what services **declare** (the aggregator's manifest and snapshots).
- `fleet` — what the collector has **observed**, stored as the `FleetView` wire contract itself
  rather than a friendlier projection of it. Fails independently: `available: false` is a resting
  state, not an error, and the estate must render fine without it. **Store the contract, not a
  convenience shape** — an earlier cut invented `heartbeats`/`flows`, and the result was a library no
  real collector could drive, with nowhere to put the three honesty channels the contract carries:
  `missingFeeds` (a dimension genuinely absent, so render "—" not 0), `window.countsWindowed` (the
  counts answer a different window than the flows), and an *absent* `lastSeen` (no live-time signal —
  never a default epoch, which once serialised as 0001-01-01 and read as "stale for two millennia").
- `catalog` — topics, topology and usage. Published together by one aggregator run and meaningless
  apart, so they load together and go stale together. Loading *settles* rather than races: one
  missing artifact must not blank the other two.
- `annotations` — discussion threads. The only read-**write** data, hence its own slice.
- `compose` — the "try it" message workflow: selection, draft, in-flight request, result.
- `capabilities` — what this mesh can actually do (`fleet`, `annotate`, `invoke`), derived from the
  API once at store creation. **Optional endpoints are state.** A component must never inspect the
  API object to decide what to render; if it did, "the UI is a function of the store" would be a lie.
- `spec` — one service's own spec document, fetched on demand. Separate from `catalog` because the
  catalog is the aggregator's cross-service view and this is a single service's self-description:
  different source, different lifetime, different failure mode.
- `view` — everything the user has done to the view: page, selection, filter, expansion, the live
  window, and whether benzene's own utility traffic counts toward the traffic surfaces.

Conflating `estate` and `fleet` is how you lose the ability to say "declared healthy, silent for six
minutes" — the single most useful thing the live plane adds. And `fleet.now` is state set by
`clockTicked`: no selector may read `Date.now()`, or staleness becomes untestable and un-memoisable.

## Honesty states

A dashboard that overclaims is worse than none. These distinctions are deliberate and tested:

- "no collector wired" is never rendered as "no issues"
- a null error rate is drawn as *unknown*, not as healthy
- a measured topic with zero traffic is a deprecation candidate; an unmeasured one is not a finding
- a service that has never reported is `silent`, not `stale` — it probably lacks the middleware
- a read-only mesh explains itself rather than showing a button that cannot work
- a collector that answers but has never seen traffic is reported **blind**, not healthy — silence
  from a broken exporter looks exactly like silence from an idle estate, and only one is good news
- the live plane's window and the usage feed's own baked window are never summed and never share a
  label; each figure carries its own provenance inline
- no version-compatibility entry means *nothing was reconciled*, not "compatible" — the aggregator
  emits one only for a topic with more than one version in play
- a produced version nothing consumes is a prompt to confirm an upcaster exists, not a proven break
- "unused" is never claimed without a usage feed; the value view degrades to structural evidence and
  says so

## Do NOT

- Do not add component-local state to "just fix" a render.
- Do not import the store into a primitive or control.
- Do not add a runtime dependency that fetches from a CDN.
- Do not hand-write `RootState` — infer it from the reducer, or thunk dispatch typing silently breaks.
