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
  /** The catalog's own filter, separate from the service filter — two lists, two questions. */
  topicFilter: string;
  /** Which column the catalog is sorted by. State, so it survives navigating away and back. */
  topicSort: { key: string; direction: 'asc' | 'desc' };
  /** Sections a reader has put away. The header stays visible; only the body is hidden. */
  collapsedSections: string[];
  /**
   * Which theme the page is painted in.
   *
   * `system` is the default and the honest one — it means nobody has expressed a preference, which
   * is different from having chosen light. The distinction matters because a reader on a machine
   * that switches at dusk should switch with it unless they said otherwise.
   */
  theme: Theme;
}

export type Theme = 'system' | 'light' | 'dark';

const initialState: ViewState = {
  page: 'fleet',
  selected: null,
  filter: '',
  expandedServices: [],
  rangeMs: 15 * 60 * 1000,
  showUtility: false,
  failingFlowsOnly: false,
  topicFilter: '',
  topicSort: { key: 'traffic', direction: 'desc' },
  collapsedSections: [],
  theme: 'system',
};

/** The order the toggle cycles in. System first, because it is the state a reader can lose. */
const THEME_CYCLE: Theme[] = ['system', 'light', 'dark'];

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
    topicFilterChanged(state, action: PayloadAction<string>) {
      state.topicFilter = action.payload;
    },
    /** Clicking the active column flips it; clicking another switches to it, descending. */
    topicSorted(state, action: PayloadAction<string>) {
      const key = action.payload;
      if (state.topicSort.key === key) {
        state.topicSort.direction = state.topicSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.topicSort = { key, direction: 'desc' };
      }
    },
    sectionToggled(state, action: PayloadAction<string>) {
      const at = state.collapsedSections.indexOf(action.payload);
      if (at === -1) state.collapsedSections.push(action.payload);
      else state.collapsedSections.splice(at, 1);
    },
    themeCycled(state) {
      state.theme = THEME_CYCLE[(THEME_CYCLE.indexOf(state.theme) + 1) % THEME_CYCLE.length]!;
    },
    /** Restoring a remembered choice, which is not the same event as a reader making one. */
    themeRestored(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
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
  failingFlowsToggled, pivotedToFailingFlows, topicFilterChanged, topicSorted, sectionToggled,
  themeCycled, themeRestored,
} = viewSlice.actions;
export default viewSlice.reducer;
