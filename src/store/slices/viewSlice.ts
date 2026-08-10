import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type Page = 'fleet' | 'service' | 'topic' | 'issue' | 'compose' | 'value';

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
  /**
   * Whether Benzene's own plumbing traffic (spec fetches, health probes, the mesh feeds) counts
   * toward what the traffic surfaces show. Off by default: in a live estate the utility topics
   * outnumber the domain ones by orders of magnitude — 9.8k spec fetches beside 11 payment
   * captures — so counting them in by default buries the signal the reader came for.
   */
  showUtility: boolean;
  /**
   * Whether the flow lists show only failures.
   *
   * Off by default — a reader arriving at a topic wants to see what normal looks like before they
   * can tell what abnormal looks like. On, it is the "240 errors, show me one" pivot: an error count
   * that cannot be drilled into is a dead end, and a dead end teaches readers to stop looking.
   */
  failingFlowsOnly: boolean;
}

const initialState: ViewState = {
  page: 'fleet',
  selected: null,
  filter: '',
  expandedServices: [],
  rangeMs: 15 * 60 * 1000,
  showUtility: false,
  failingFlowsOnly: false,
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
    utilityToggled(state) {
      state.showUtility = !state.showUtility;
    },
    failingFlowsToggled(state) {
      state.failingFlowsOnly = !state.failingFlowsOnly;
    },
    /** The pivot itself: open a topic with its failing flows already showing. */
    pivotedToFailingFlows(state, action: PayloadAction<string>) {
      state.page = 'topic';
      state.selected = action.payload;
      state.failingFlowsOnly = true;
    },
  },
});

export const {
  navigated, filterChanged, serviceToggled, allCollapsed, rangeChanged, utilityToggled,
  failingFlowsToggled, pivotedToFailingFlows,
} = viewSlice.actions;
export default viewSlice.reducer;
