import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Page = 'fleet' | 'service' | 'topic' | 'issue' | 'compose';

/**
 * View state lives here, not in components.
 *
 * Which card is expanded, what the filter box contains, which page is showing — all of it is store
 * state. Components take props and render; they hold nothing. That is what makes the behaviour
 * testable without a DOM: expanding a card is an action and an assertion on a selector, not a click
 * and a query.
 */
export interface ViewState {
  page: Page;
  /** The entity the current page is about — a service name, topic id, or issue id. */
  selected: string | null;
  filter: string;
  expandedServices: string[];
  /** Millisecond window the live planes are reporting over. */
  rangeMs: number;
}

const initialState: ViewState = {
  page: 'fleet',
  selected: null,
  filter: '',
  expandedServices: [],
  rangeMs: 15 * 60 * 1000,
};

const viewSlice = createSlice({
  name: 'view',
  initialState,
  reducers: {
    navigated(state, action: PayloadAction<{ page: Page; selected?: string | null }>) {
      state.page = action.payload.page;
      state.selected = action.payload.selected ?? null;
    },
    filterChanged(state, action: PayloadAction<string>) {
      state.filter = action.payload;
    },
    serviceToggled(state, action: PayloadAction<string>) {
      const name = action.payload;
      const at = state.expandedServices.indexOf(name);
      if (at === -1) state.expandedServices.push(name);
      else state.expandedServices.splice(at, 1);
    },
    allCollapsed(state) {
      state.expandedServices = [];
    },
    rangeChanged(state, action: PayloadAction<number>) {
      state.rangeMs = action.payload;
    },
  },
});

export const { navigated, filterChanged, serviceToggled, allCollapsed, rangeChanged } =
  viewSlice.actions;
export default viewSlice.reducer;
