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

`src/contracts/` mirrors `docs/specification/mesh.md` in the specification repo. `contracts/` holds
vendored conformance fixtures pinned by `SPEC_VERSION`. Do not invent contract shapes — if a field is
needed and the spec does not have it, that is a spec change first.

## Do NOT

- Do not add component-local state to "just fix" a render.
- Do not import the store into a primitive or control.
- Do not add a runtime dependency that fetches from a CDN.
- Do not hand-write `RootState` — infer it from the reducer, or thunk dispatch typing silently breaks.
