import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { loadManifest } from './store/slices/estateSlice';
import { filterChanged } from './store/slices/viewSlice';
import { selectEstateSummary, selectLoad, selectError } from './store/selectors';
import { ServiceList } from './components/containers/ServiceList';
import { StatusGlyph } from './components/primitives/StatusGlyph';
import { EmptyState } from './components/primitives/EmptyState';

/**
 * The composition root — the one place an effect is allowed, because kicking off the initial load is
 * not state, it is a lifecycle. Everything below this is a function of the store.
 */
export function App() {
  const dispatch = useAppDispatch();
  const load = useAppSelector(selectLoad);
  const error = useAppSelector(selectError);
  const filter = useAppSelector((s) => s.view.filter);
  const summary = useAppSelector(selectEstateSummary);

  useEffect(() => {
    void dispatch(loadManifest());
  }, [dispatch]);

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Benzene Mesh</h1>
        {summary.worst && <StatusGlyph rag={summary.worst} label={`worst status: ${summary.worst}`} />}
        <span style={{ color: 'var(--bz-muted)', fontSize: '0.9rem' }}>
          {summary.total} services · {summary.drift} with drift
        </span>
        <input
          aria-label="Filter services"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => dispatch(filterChanged(e.target.value))}
          style={{ marginLeft: 'auto', padding: '0.3rem 0.5rem' }}
        />
      </header>

      {load === 'loading' && <EmptyState message="Loading the estate…" />}
      {load === 'failed' && <EmptyState message={error ?? 'The estate could not be loaded.'} />}
      {load === 'ready' && <ServiceList />}
    </main>
  );
}
