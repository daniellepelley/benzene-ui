import type { RefreshState } from '../../store/slices/estateSlice';
import { EmptyState } from '../primitives/EmptyState';
import { RefreshButton } from './RefreshButton';

export interface CatalogEmptyProps {
  /** True when a refresh endpoint is configured, which makes the next click available right here. */
  canRefresh: boolean;
  refresh: RefreshState;
  refreshNote?: string | null;
  onRefresh: () => void;
}

/**
 * The first minute of a deployment.
 *
 * A mesh that has just been stood up has run no discovery pass, so there is no `manifest.json` to
 * fetch, so the artifact store answers 404. That is not an error — it is the expected state of every
 * fresh deployment — and rendering it as "404 Not Found for manifest.json" meant the first thing the
 * owner of a new mesh ever saw was a failure message about a filename.
 *
 * So it says what is true and what happens next. When the mesh can be asked for a pass on demand,
 * the ask is the page's only control: the reader gets themselves out of this state in one click.
 * When it cannot, the honest thing is to name the thing they are waiting for rather than offer a
 * button that would do nothing.
 *
 * The sentence itself is an `unknown`-tone {@link EmptyState}, because that tone already means
 * exactly this and only this in the rest of the product — "cannot be known yet" — and a first-run
 * catalog inventing its own way to say so would be one more dashed box meaning something new.
 */
export function CatalogEmpty({ canRefresh, refresh, refreshNote, onRefresh }: CatalogEmptyProps) {
  return (
    <div className="bz-first-run">
      <h2>No catalog yet</h2>
      <EmptyState
        tone="unknown"
        message="The mesh hasn’t published its first discovery pass, so there is nothing to show here yet."
      />
      {canRefresh ? (
        <RefreshButton
          available
          state={refresh}
          note={refreshNote}
          onRefresh={onRefresh}
          label="Run a discovery pass"
        />
      ) : (
        <p className="bz-page-note">
          The catalog appears here once the mesh’s scheduled aggregation runs.
        </p>
      )}
    </div>
  );
}
