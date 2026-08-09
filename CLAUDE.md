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
budget (currently 179 KB against the 274 KB hand-written UI it replaces).

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

## State slices

Three, and the separation is load-bearing:

- `estateSlice` — what services **declare** (the aggregator's manifest and snapshots).
- `fleetSlice` — what the collector has **observed** (heartbeats, issues, flows). Fails independently:
  `available: false` is a resting state, not an error, and the estate must render fine without it.
- `viewSlice` — everything the user has done to the view.

Conflating the first two is how you lose the ability to say "declared healthy, silent for six
minutes" — which is the single most useful thing the live plane adds. And note that `fleetSlice.now`
is state set by `clockTicked`: no selector may read `Date.now()`, or staleness becomes untestable and
un-memoisable.

## Do NOT

- Do not add component-local state to "just fix" a render.
- Do not import the store into a primitive or control.
- Do not add a runtime dependency that fetches from a CDN.
- Do not hand-write `RootState` — infer it from the reducer, or thunk dispatch typing silently breaks.
