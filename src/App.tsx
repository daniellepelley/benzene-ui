import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import {
  loadManifest, loadService, refreshManifest, refreshEstate, ARTIFACT_POLL_MS,
} from './store/slices/estateSlice';
import { loadCatalog } from './store/slices/catalogSlice';
import { probeFleet, pollInbox, clockTicked, FLEET_POLL_MS, INBOX_POLL_MS } from './store/slices/fleetSlice';
import { ErrorBoundary } from './components/primitives/ErrorBoundary';
import { navigated, themeCycled, themeRestored, type Theme } from './store/slices/viewSlice';
import {
  selectLoad, selectError, selectPage, selectSelected, selectSelectedService, selectEstateSummary,
  selectFeedHealth, selectRefreshState, selectRefreshNote, selectCanRefresh, selectLogoutUrl,
  selectNow,
} from './store/selectors';
import {
  FleetPage, ServicePage, TopicPage, IssuePage, ValuePage, TestConsolePage,
  ChangesPage, TopicsPage,
} from './components/pages';
import type { Page } from './store/slices/viewSlice';
import { FeedHealthLine } from './components/controls/FeedHealthLine';
import { EmptyState } from './components/primitives/EmptyState';
import { StatusGlyph } from './components/primitives/StatusGlyph';
import { Stamp } from './components/primitives/Stamp';
import { ThemeToggle } from './components/controls/ThemeToggle';
import { RefreshButton } from './components/controls/RefreshButton';
import { SignOut } from './components/controls/SignOut';
import { CatalogEmpty } from './components/controls/CatalogEmpty';

/**
 * The navigation, as data — one entry per destination, in the order a reader works through them:
 * the estate, then what it does, then what changed, then what is wrong, then what could go, then
 * the tool. Every screen in the product is reachable from here, which was the point.
 *
 * `Retire` is deliberately not `Value`: "value" is the product's own word for the question, and the
 * question a reader actually arrives with is "what could we retire?".
 */
const NAV: { page: Page; label: string; selected?: string }[] = [
  { page: 'fleet', label: 'Estate' },
  { page: 'topics', label: 'Topics' },
  { page: 'changes', label: 'Changes' },
  // IssuePage treats 'all' as the queue rather than one signature, so the nav opens the queue.
  { page: 'issue', label: 'Issues', selected: 'all' },
  { page: 'retire', label: 'Retire' },
  { page: 'test', label: 'Test' },
];

/** Where a reader's theme choice is remembered between visits. */
const THEME_KEY = 'benzene.mesh.theme';
const isTheme = (value: unknown): value is Theme =>
  value === 'system' || value === 'light' || value === 'dark';

/**
 * The composition root, and the only place effects are allowed — starting a load and running a clock
 * are lifecycles, not state. Everything below is a function of the store.
 */
export function App() {
  const dispatch = useAppDispatch();
  const load = useAppSelector(selectLoad);
  const error = useAppSelector(selectError);
  const page = useAppSelector(selectPage);
  const selected = useAppSelector(selectSelected);
  const selectedService = useAppSelector(selectSelectedService);
  const summary = useAppSelector(selectEstateSummary);
  const feedHealth = useAppSelector(selectFeedHealth);
  const generatedAtUtc = useAppSelector((s) => s.estate.generatedAtUtc);
  const now = useAppSelector(selectNow);
  const theme = useAppSelector((s) => s.view.theme);
  const canRefresh = useAppSelector(selectCanRefresh);
  const refresh = useAppSelector(selectRefreshState);
  const refreshNote = useAppSelector(selectRefreshNote);
  const logoutUrl = useAppSelector(selectLogoutUrl);
  const onRefresh = () => void dispatch(refreshEstate());

  useEffect(() => {
    void dispatch(loadManifest());
    void dispatch(loadCatalog());
    void dispatch(probeFleet());
    void dispatch(pollInbox());
  }, [dispatch]);

  // The inbox is a separate question on a much slower cadence: a fixed 24 hours, counts only. A
  // day-wide view does not need minute-fresh data, and on a trace-backed plane asking for it at the
  // live cadence would scan — and bill for — a day of traces every fifteen seconds.
  useEffect(() => {
    const id = setInterval(() => void dispatch(pollInbox()), INBOX_POLL_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  // The published artifacts, re-fetched together on a slower cadence than the live poll. Together,
  // because one aggregator run publishes all of them under one `generatedAtUtc` — refreshing the
  // manifest alone would put fresh statuses under a stale map. Slower, because they change when the
  // aggregator runs, not continuously; polling them at the live cadence would be asking a question
  // whose answer cannot have moved.
  useEffect(() => {
    const id = setInterval(() => {
      void dispatch(refreshManifest());
      void dispatch(loadCatalog());
    }, ARTIFACT_POLL_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  // The theme is store state; the document attribute and the remembered choice are the effects of
  // it. Both live here rather than in the toggle, so the control stays a pure function of a prop —
  // and so a consumer embedding these components can persist the choice their own way.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (isTheme(saved)) dispatch(themeRestored(saved));
    } catch {
      // Storage can be unavailable (private mode, an embedding iframe). Following the OS is a fine
      // outcome; failing to render the page over a preference is not.
    }
  }, [dispatch]);

  useEffect(() => {
    // Absent, not "system" — the stylesheet's `:not([data-theme='light'])` guard reads an absent
    // attribute as "no preference expressed", which is exactly what `system` means.
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // As above: the page works, the choice just does not outlive the tab.
    }
  }, [theme]);

  // Staleness is computed from `fleet.now`, so something has to advance it. A selector reading the
  // clock directly would be neither memoisable nor testable.
  useEffect(() => {
    const tick = () => dispatch(clockTicked(Date.now()));
    tick();
    const id = setInterval(() => {
      tick();
      void dispatch(probeFleet());
    }, FLEET_POLL_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  // A service's snapshot — its spec, health checks and drift hashes — is one file per service, so it
  // is fetched on drill-in rather than up front. Without this the About and Health panels sit empty
  // for ever, which reads as "this service published nothing" rather than "nobody asked".
  useEffect(() => {
    if (page === 'service' && selected) void dispatch(loadService(selected));
  }, [dispatch, page, selected]);

  // Changing the window is a new question, not a new rendering of the old answer — the collector has
  // to be asked again, or every live figure on the page would keep its old window's numbers under a
  // new window's label.
  const rangeMs = useAppSelector((s) => s.view.rangeMs);
  useEffect(() => {
    void dispatch(probeFleet());
  }, [dispatch, rangeMs]);

  return (
    <div className="bz-app">
      <header className="bz-app-head">
        <button type="button" className="bz-brand" onClick={() => dispatch(navigated({ page: 'fleet' }))}>
          {/* The brand mark, inline: no font, no request, and it survives being embedded offline. */}
          <svg viewBox="0 0 100 100" width="20" height="20" aria-hidden="true" focusable="false">
            <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" fill="none" stroke="currentColor" strokeWidth="8" />
            <circle cx="50" cy="50" r="26" fill="none" stroke="currentColor" strokeWidth="8" />
          </svg>
          Benzene Mesh
        </button>
        {/* How old is what I am looking at. It is in the contract and was rendered nowhere — a
            dashboard that will not say when it was last right is asking to be trusted blindly.
            The AGE is the half that decides anything: a 2.5-month-stale snapshot rendered a raw UTC
            string indistinguishable from a fresh one, while every obligation on the Changes page was
            computed from it. */}
        <span className="bz-app-meta" title="When the aggregator last published these artifacts">
          <Stamp
            iso={generatedAtUtc}
            now={now}
            label="generated"
            absent="the aggregator published no timestamp with these artifacts"
          />
        </span>
        {/* SIX destinations for six screens. Four entries for eight screens is why readers reported
            they could not get back: Issues — the strongest surface in the product — was reachable
            only through a conditional "see all" on the estate, and Topics, the estate's functional
            map, had no route at all. */}
        <nav className="bz-nav">
          {NAV.map((item) => (
            <button
              key={item.page}
              type="button"
              aria-current={page === item.page ? 'page' : undefined}
              onClick={() => dispatch(navigated({
                page: item.page,
                ...(item.selected !== undefined ? { selected: item.selected } : {}),
              }))}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {/* The worst status in the estate, always in the same place — a reader who checks one thing
            on arrival checks this, and it must not move about as the page changes. */}
        {summary.worst && (
          <span className="bz-app-worst" title={`Worst status in the estate: ${summary.worst}`}>
            <StatusGlyph rag={summary.worst} label={`worst status: ${summary.worst}`} />
          </span>
        )}
        {/* THE PICKER IS NOT HERE ANY MORE, and that is the fix.
            A window control in the chrome is a global control over a non-global fact. It sat above
            two surfaces with their own fixed 24-hour window, above usage figures that structurally
            cannot be re-windowed client-side, and above counts the live plane itself declares it does
            not window — so changing it moved numbers that were not governed by it and left numbers
            that looked like they were. Four readers reported it independently across three rounds,
            and three of its four failures were failures of PLACEMENT.
            A window control now lives on the surface whose data it governs, beside that surface's own
            `countsWindowed`/`countsSince` disclosure, or it does not exist. The page ends up with
            fewer controls and more stated windows, which is the right direction. */}
        {/* Appearance, freshness and session: the three things that are about this page rather than
            about the estate, held together at the right-hand end of the bar. Each is absent when the
            deployment has not wired it, so an unauthenticated local mesh gets only the toggle. */}
        <span className="bz-app-tools">
          {/* Stood down while the first-run state is on screen: that state carries its own copy of
              this control as its call to action, and two Refresh buttons — each answering a throttle
              with its own message — would be one more than the page has questions. */}
          <RefreshButton
            available={canRefresh && load !== 'empty'}
            state={refresh}
            note={refreshNote}
            onRefresh={onRefresh}
          />
          <ThemeToggle theme={theme} onCycle={() => dispatch(themeCycled())} />
          <SignOut url={logoutUrl} />
        </span>
      </header>

      {/* Only when something is wrong: a green line here would be chrome in the place a warning
          eventually has to appear, and readers learn to skip chrome. */}
      <FeedHealthLine health={feedHealth} />

      <main>
        {load === 'loading' && <EmptyState message="Loading the estate…" />}
        {load === 'failed' && <EmptyState message={error ?? 'The estate could not be loaded.'} />}
        {/* Not a failure: the mesh is up and has published nothing yet. See CatalogEmpty. */}
        {load === 'empty' && (
          <CatalogEmpty
            canRefresh={canRefresh}
            refresh={refresh}
            refreshNote={refreshNote}
            onRefresh={onRefresh}
          />
        )}
        {load === 'ready' && (
          // Keyed on the page and selection so navigating away from a crashed view clears the error
          // — without the key, a boundary that caught once stays caught and every subsequent click
          // shows the same failure.
          <ErrorBoundary
            key={`${page}:${selected ?? ''}:${selectedService ?? ''}`}
            onReset={() => dispatch(navigated({ page: 'fleet' }))}
          >
            {page === 'fleet' && <FleetPage />}
            {page === 'service' && selected && <ServicePage service={selected} />}
            {page === 'topic' && selected && <TopicPage topic={selected} />}
            {page === 'issue' && <IssuePage selected={selected ?? 'all'} />}
            {page === 'topics' && <TopicsPage />}
            {page === 'changes' && <ChangesPage />}
            {page === 'retire' && <ValuePage />}
            {page === 'test' && <TestConsolePage service={selectedService} topic={selected} />}
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
