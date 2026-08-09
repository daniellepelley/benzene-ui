import { configureStore, combineReducers } from '@reduxjs/toolkit';
import estate, { type MeshApi } from './slices/estateSlice';
import view from './slices/viewSlice';
import fleet from './slices/fleetSlice';

/**
 * The store is the application. Components render from it and dispatch into it; they hold no state
 * of their own, so every behaviour worth testing is reachable as `dispatch(action)` followed by an
 * assertion on a selector.
 *
 * The mesh API is injected as the thunk `extra` argument, so tests supply a stub and the real client
 * is wired only at the composition root — no test ever touches `fetch`.
 */
const rootReducer = combineReducers({ estate, view, fleet });

export const createStore = (api: MeshApi, preloadedState?: Partial<RootState>) =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault({ thunk: { extraArgument: api } }),
    preloadedState,
  });

/**
 * Both types are *inferred*, never hand-written. A hand-written RootState compiles but silently
 * strips the thunk middleware from the dispatch signature, so `dispatch(someThunk())` stops
 * type-checking — which is exactly what happened the first time this file was written.
 */
export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore['dispatch'];
