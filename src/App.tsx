import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { loadManifest, loadService } from './store/slices/estateSlice';
import { loadCatalog } from './store/slices/catalogSlice';
import { loadAnnotations } from './store/slices/annotationsSlice';
import { probeFleet, pollInbox, clockTicked, FLEET_POLL_MS, INBOX_POLL_MS } from './store/slices/fleetSlice';
import { filterChanged, navigated, rangeChanged } from './store/slices/viewSlice';
import {
  selectLoad, selectError, selectPage, selectSelected, selectEstateSummary, selectFeedHealth,
  RANGE_OPTIONS,
} from './store/selectors';
import { FleetPage, ServicePage, TopicPage, IssuePage, ComposePage, ValuePage } from './components/pages';
import { FeedHealthLine } from './components/controls/FeedHealthLine';
import { EmptyState } from './components/primitives/EmptyState';
import { StatusGlyph } from './components/primitives/StatusGlyph';
import { RangePicker } from './components/controls/RangePicker';

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
  const filter = useAppSelector((s) => s.view.filter);
  const summary = useAppSelector(selectEstateSummary);
  const feedHealth = useAppSelector(selectFeedHealth);
  const generatedAtUtc = useAppSelector((s) => s.estate.generatedAtUtc);
  const liveAvailable = useAppSelector((s) => s.fleet.available);

  useEffect(() => {
    void dispatch(loadManifest());
    void dispatch(loadCatalog());
    void dispatch(loadAnnotations());
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
            dashboard that will not say when it was last right is asking to be trusted blindly. */}
        {generatedAtUtc && (
          <span className="bz-app-meta" title="When the aggregator last published these artifacts">
            generated {generatedAtUtc}
          </span>
        )}
        <nav className="bz-nav">
          <button
            type="button"
            aria-current={page === 'fleet' ? 'page' : undefined}
            onClick={() => dispatch(navigated({ page: 'fleet' }))}
          >
            Estate
          </button>
          <button
            type="button"
            aria-current={page === 'value' ? 'page' : undefined}
            onClick={() => dispatch(navigated({ page: 'value' }))}
          >
            Value
          </button>
        </nav>
        {/* The worst status in the estate, always in the same place — a reader who checks one thing
            on arrival checks this, and it must not move about as the page changes. */}
        {summary.worst && (
          <span className="bz-app-worst" title={`Worst status in the estate: ${summary.worst}`}>
            <StatusGlyph rag={summary.worst} label={`worst status: ${summary.worst}`} />
          </span>
        )}
        {/* The window governs every live figure on every page, so it belongs in the one place that
            is on every page — not inside the Estate panel, where it vanished on navigation. */}
        <RangePicker
          rangeMs={rangeMs}
          options={RANGE_OPTIONS}
          available={liveAvailable}
          onChange={(ms) => dispatch(rangeChanged(ms))}
        />
        <input
          aria-label="Filter services"
          placeholder="Filter services…"
          value={filter}
          onChange={(e) => dispatch(filterChanged(e.target.value))}
        />
      </header>

      {/* Only when something is wrong: a green line here would be chrome in the place a warning
          eventually has to appear, and readers learn to skip chrome. */}
      <FeedHealthLine health={feedHealth} />

      <main>
        {load === 'loading' && <EmptyState message="Loading the estate…" />}
        {load === 'failed' && <EmptyState message={error ?? 'The estate could not be loaded.'} />}
        {load === 'ready' && (
          <>
            {page === 'fleet' && <FleetPage />}
            {page === 'service' && selected && <ServicePage service={selected} />}
            {page === 'topic' && selected && <TopicPage topic={selected} />}
            {page === 'issue' && <IssuePage selected={selected ?? 'all'} />}
            {page === 'compose' && selected && <ComposePage topic={selected} />}
            {page === 'value' && <ValuePage />}
          </>
        )}
      </main>
    </div>
  );
}
