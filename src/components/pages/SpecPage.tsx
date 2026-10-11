import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectContractDocument, selectSpecLoad, selectSpecError, selectSpecSummary, selectOperations,
  selectSendOperations, selectExpandedOperations, selectSpecSchemas,
} from '../../store/selectors';
import { operationToggled, allOperationsCollapsed } from '../../store/slices/specSlice';
import { SpecOperation } from '../sections/SpecOperation';
import { SpecSummary } from '../sections/SpecSummary';
import { SchemaTree } from '../sections/SchemaTree';
import { EmptyState } from '../primitives/EmptyState';

export interface SpecPageProps {
  /** The service whose spec this is. Shown so a reader arriving from a link knows where they are. */
  service?: string | null;
  /** Where "back to the mesh" goes, when this page was opened from one. */
  meshHref?: string | null;
}

/**
 * A service's contract, read without reading its source.
 *
 * The audience is someone deciding whether to call this service, or why their call is failing —
 * which is why the collapsed line carries the reachable route and the payload names, and the schema
 * only opens on request. A service with forty topics is unreadable with every schema expanded.
 */
export function SpecPage({ service, meshHref }: SpecPageProps) {
  const dispatch = useAppDispatch();
  const spec = useAppSelector(selectContractDocument);
  const load = useAppSelector(selectSpecLoad);
  const error = useAppSelector(selectSpecError);
  const summary = useAppSelector(selectSpecSummary);
  const operations = useAppSelector(selectOperations);
  const sends = useAppSelector(selectSendOperations);
  const expanded = useAppSelector(selectExpandedOperations);
  const schemas = useAppSelector(selectSpecSchemas);

  if (load === 'loading' || load === 'idle') return <EmptyState message="Loading the spec…" tone="unknown" />;
  if (load === 'failed') return <EmptyState message={error ?? 'The spec could not be loaded.'} tone="unknown" />;
  if (!spec) {
    // The snapshot exists but carries no spec — the service is reachable and says nothing about
    // itself, which is a different problem from being unreachable.
    return <EmptyState message={`${service ?? 'This service'} published no spec.`} />;
  }

  return (
    <div className="bz-page bz-spec">
      <header className="bz-page-head">
        <h2>{spec.service ?? service ?? 'Service spec'}</h2>
        {spec.serviceVersion && <span className="bz-page-note">v{spec.serviceVersion}</span>}
        {meshHref && (
          <a className="bz-spec-back" href={meshHref}>
            ← back to the mesh
          </a>
        )}
      </header>

      {spec.description && <p className="bz-spec-desc">{spec.description}</p>}

      <SpecSummary summary={summary} />

      <section>
        <header className="bz-spec-section-head">
          <h3>Operations</h3>
          {expanded.length > 0 && (
            <button type="button" onClick={() => dispatch(allOperationsCollapsed())}>
              collapse all
            </button>
          )}
        </header>

        {operations.length === 0 ? (
          <EmptyState message="This service exposed no message contract." />
        ) : (
          operations.map((operation) => (
            <SpecOperation
              key={operation.id}
              operation={operation}
              expanded={expanded.includes(operation.id)}
              onToggle={(id) => dispatch(operationToggled(id))}
            />
          ))
        )}
      </section>

      {sends.length > 0 && (
        <section>
          <header className="bz-spec-section-head">
            <h3>Sends</h3>
          </header>
          {/* What this service depends on, not what it offers: topics another party defines. A
              legacy document folded these into its events, where they cannot be told apart. */}
          <p className="bz-page-note">Messages this service sends to topics other services define.</p>
          {sends.map((operation) => (
            <SpecOperation
              key={operation.id}
              operation={operation}
              expanded={expanded.includes(operation.id)}
              onToggle={(id) => dispatch(operationToggled(id))}
            />
          ))}
        </section>
      )}

      {schemas.length > 0 && (
        <section>
          <h3>Schemas</h3>
          {schemas.map(({ name, schema }) => (
            <div className="bz-spec-schema" key={name}>
              <h4>{name}</h4>
              <SchemaTree schema={schema} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
