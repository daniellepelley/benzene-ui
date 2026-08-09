import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { loadManifest, loadService } from './store/slices/estateSlice';
import { loadCatalog } from './store/slices/catalogSlice';
import { loadAnnotations } from './store/slices/annotationsSlice';
import { probeFleet, clockTicked, FLEET_POLL_MS } from './store/slices/fleetSlice';
import { filterChanged, navigated } from './store/slices/viewSlice';
import {
  selectLoad, selectError, selectPage, selectSelected, selectEstateSummary, selectFeedHealth,
} from './store/selectors';
import { FleetPage, ServicePage, TopicPage, IssuePage, ComposePage, ValuePage } from './components/pages';
import { FeedHealthLine } from './components/controls/FeedHealthLine';
import { EmptyState } from './components/primitives/EmptyState';
import { StatusGlyph } from './components/primitives/StatusGlyph';

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

  useEffect(() => {
    void dispatch(loadManifest());
    void dispatch(loadCatalog());
    void dispatch(loadAnnotations());
    void dispatch(probeFleet());
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
          Benzene Mesh
        </button>
        <button type="button" onClick={() => dispatch(navigated({ page: 'value' }))}>
          Value
        </button>
        {summary.worst && <StatusGlyph rag={summary.worst} label={`worst status: ${summary.worst}`} />}
        <input
          aria-label="Filter"
          placeholder="Filter…"
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
