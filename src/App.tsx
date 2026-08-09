import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { loadManifest } from './store/slices/estateSlice';
import { loadCatalog } from './store/slices/catalogSlice';
import { loadAnnotations } from './store/slices/annotationsSlice';
import { probeFleet, clockTicked } from './store/slices/fleetSlice';
import { filterChanged, navigated } from './store/slices/viewSlice';
import { selectLoad, selectError, selectPage, selectSelected, selectEstateSummary } from './store/selectors';
import { FleetPage, ServicePage, TopicPage, IssuePage, ComposePage } from './components/pages';
import { EmptyState } from './components/primitives/EmptyState';
import { StatusGlyph } from './components/primitives/StatusGlyph';

const POLL_MS = 15_000;

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
    }, POLL_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  return (
    <div className="bz-app">
      <header className="bz-app-head">
        <button type="button" className="bz-brand" onClick={() => dispatch(navigated({ page: 'fleet' }))}>
          Benzene Mesh
        </button>
        {summary.worst && <StatusGlyph rag={summary.worst} label={`worst status: ${summary.worst}`} />}
        <input
          aria-label="Filter"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => dispatch(filterChanged(e.target.value))}
        />
      </header>

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
          </>
        )}
      </main>
    </div>
  );
}
