# benzene-ui

React components for the Benzene Mesh UI. Cross-language by construction: the components speak the
mesh **contracts**, not any one implementation, so a service written in .NET, Go, TypeScript or
Python is rendered by the same UI.

## The one rule

**The UI is a function of the store. Components hold no state.**

No `useState`, no `useReducer`, no local refs standing in for state. Which card is expanded, what is
in the filter box, which page is showing — all of it lives in Redux. A component takes props and
renders; a container reads selectors and dispatches actions.

That is not style. It is what makes the behaviour testable:

```ts
store.dispatch(serviceToggled('orders-api'));
expect(selectExpandedCount(store.getState())).toBe(1);
```

No DOM, no click simulation, no waiting. The predecessor to this library was 4,000 lines of
imperative DOM manipulation with **595 top-level variables and zero tests** — every change was
verified by opening the page and looking. The rule above is the direct answer to that.

The single permitted exception is the composition root (`App.tsx`), which may run an effect to kick
off the initial load, because starting a fetch is a lifecycle rather than state.

## Why Redux Toolkit

Redux, modernised — the same actions/reducers/selectors model, without the boilerplate that made
classic Redux tiring. `createSlice` generates the action creators, Immer allows straight-line
"mutation" in reducers that produces immutable updates, and `createAsyncThunk` gives loading and
failure states as ordinary reducer cases.

The alternatives were considered and rejected for this codebase: Zustand and Jotai are lighter but
put state back near components and have no action log, which is precisely what we are moving away
from; XState is a better fit for one complex workflow than for a whole application's state.

## Layout

```
src/
  contracts/    generated.ts (do not edit) + mesh.ts, the semantic layer over it
  store/        seven slices, selectors, routing, typed hooks — the application
  components/
    primitives/ Badge · Chip · EmptyState · StatusGlyph
    controls/   ServiceCard · LiveStrip · IssueRow · ValueRow · UsagePanel · TopicList · EdgeList
                FeedHealthLine · RetirementRow · RangePicker
    sections/   TopologyGraph (+ pure topologyLayout) · SchemaTree · HealthChecks · Thread · Composer
                MessageComposer · VersionCompatibility · ServiceAbout · ServiceUsage · TopicLiveStrip
    containers/ ServiceList — the only place a component meets the store
    pages/      Fleet · Service · Topic · Issue · Compose · Value
  data/         the mesh HTTP client, injected into the store
  theme/        design tokens
contracts/      vendored sample artifacts + SPEC_VERSION (codegen input)
scripts/        generate-contracts.mjs
```

## Seven slices

| Slice | Holds |
|---|---|
| `estate` | What services **declare** — the aggregator's manifest and per-service snapshots |
| `fleet` | What the collector has **observed** — heartbeats, issues, flows. Fails independently |
| `catalog` | Topics, topology and usage — published together, so they live together |
| `annotations` | Discussion threads. The only read-**write** data, hence its own slice |
| `compose` | The try-it workflow — topic, version, transport, body, headers, result |
| `capabilities` | What this mesh can do — derived from the injected API, not guessed at |
| `view` | Page, selection, filter, expansion, live window, utility toggle — everything the user has done |

Keeping `estate` and `fleet` apart is what makes `selectDivergences` expressible: services declaring
healthy that have stopped reporting. That is the single most useful thing the live plane adds.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Vitest — store tests plus container tests |
| `npm run storybook` | Storybook on :6006 |
| `npm run build` | The single self-contained `dist/index.html` |
| `npm run build:storybook` | Static Storybook, publishable to benzene.app |

## The build target is one file

`dist/index.html` has **no external requests** — JS and CSS are inlined. `Benzene.Mesh.Ui` embeds it
as a resource and serves it from inside the running service: no CDN, no static hosting, no network
egress. That rules out code splitting and makes bundle size a budget.

Current: **232 KB**, against the 274 KB hand-written UI it replaces. React and Redux Toolkit
included, the whole application is *smaller* than what it replaces, because a minifier beats
hand-maintained source. CI asserts there are no external requests.

## Contracts

`contracts/` holds conformance fixtures vendored from the specification repo, pinned by
`contracts/SPEC_VERSION`. This is the mechanism every language port already uses: when the spec
moves, the drift check fails here, and a contract change becomes a build failure rather than an
`undefined` at runtime.

## Using the components on their own

Everything is exported, so a team can assemble their own mesh UI:

```tsx
import { ServiceCard, StatusGlyph, ragForStatus } from '@benzene/ui';

<ServiceCard service={svc} rag={ragForStatus(svc.status)} expanded={open} onToggle={…} onOpen={…} />
```

The components never reach for the store themselves — only the containers do — so they work equally
well driven by your own state.
