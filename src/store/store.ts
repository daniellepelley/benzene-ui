import { configureStore, combineReducers } from '@reduxjs/toolkit';
import estate, { type MeshApi } from './slices/estateSlice';
import view from './slices/viewSlice';
import fleet from './slices/fleetSlice';
import catalog from './slices/catalogSlice';
import compose from './slices/composeSlice';
import capabilities, { capabilitiesOf } from './slices/capabilitiesSlice';
import spec from './slices/specSlice';

/**
 * The store is the application. Components render from it and dispatch into it; they hold no state
 * of their own, so every behaviour worth testing is reachable as `dispatch(action)` followed by an
 * assertion on a selector.
 *
 * The mesh API is injected as the thunk `extra` argument, so tests supply a stub and the real client
 * is wired only at the composition root — no test ever touches `fetch`.
 */
const rootReducer = combineReducers({
  estate, view, fleet, catalog, compose, capabilities, spec,
});

export const createStore = (api: MeshApi, preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: api } }),
    // Capabilities are derived from the API once, here, so components read them from state like
    // everything else rather than inspecting the API object.
    preloadedState: { capabilities: capabilitiesOf(api), ...preloadedState },
  });

/**
 * Both types are *inferred*, never hand-written. A hand-written RootState compiles but silently
 * strips the thunk middleware from the dispatch signature, so `dispatch(someThunk())` stops
 * type-checking — which is exactly what happened the first time this file was written.
 */
export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore['dispatch'];
