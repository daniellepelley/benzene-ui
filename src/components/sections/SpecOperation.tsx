import type { SpecOperationModel } from '../../store/selectors';
import { schemaLabel } from '../../store/selectors';
import { SchemaTree } from './SchemaTree';
import { Badge } from '../primitives/Badge';
import { Chip } from '../primitives/Chip';

export interface SpecOperationProps {
  operation: SpecOperationModel;
  expanded: boolean;
  onToggle: (id: string) => void;
}

/** HTTP verbs carry their own conventional weight; a reader scans for them before reading anything. */
const METHOD_RAG = {
  GET: 'green',
  POST: 'amber',
  PUT: 'amber',
  PATCH: 'amber',
  DELETE: 'red',
} as const;

/**
 * One thing a service can do.
 *
 * Collapsed, it is a line a reader can scan: how to reach it, what goes in, what comes out. Expanded,
 * it is the payload contract. That split is the whole design — a service with forty topics is
 * unreadable if every schema is open, and useless if none can be.
 *
 * Expansion is a prop, not local state, so a link can arrive with an operation already open.
 */
export function SpecOperation({ operation, expanded, onToggle }: SpecOperationProps) {
  const { kind, topic, version, httpMappings, input, output, example } = operation;
  const isEvent = kind === 'event';

  return (
    <article className="bz-op" data-kind={kind} data-expanded={expanded}>
      <button
        type="button"
        className="bz-op-head"
        aria-expanded={expanded}
        onClick={() => onToggle(operation.id)}
      >
        <span className="bz-op-badges">
          {isEvent ? (
            <Badge rag="green">event</Badge>
          ) : httpMappings.length > 0 ? (
            httpMappings.map((h) => (
              <Badge key={`${h.method} ${h.path}`} rag={METHOD_RAG[h.method.toUpperCase() as keyof typeof METHOD_RAG] ?? 'gone'}>
                {h.method.toUpperCase()}
              </Badge>
            ))
          ) : (
            // Reachable by message only. Said plainly, because "no HTTP verb" is not "unreachable".
            <Badge rag="gone">msg</Badge>
          )}
        </span>
        <span className="bz-op-topic">{topic}</span>
        {version && <Chip title="Handler version">{version}</Chip>}
        <span className="bz-op-io">
          {isEvent ? (
            schemaLabel(input)
          ) : (
            <>
              {schemaLabel(input)} <span className="bz-op-arrow">→</span> {schemaLabel(output)}
            </>
          )}
        </span>
        <span className="bz-op-chev" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <div className="bz-op-body">
          {httpMappings.length > 0 && (
            <ul className="bz-op-http">
              {httpMappings.map((h) => (
                <li key={`${h.method} ${h.path}`}>
                  <Badge rag={METHOD_RAG[h.method.toUpperCase() as keyof typeof METHOD_RAG] ?? 'gone'}>
                    {h.method.toUpperCase()}
                  </Badge>
                  <code>{h.path}</code>
                </li>
              ))}
            </ul>
          )}

          <div className="bz-op-grid">
            <div>
              <h4>{isEvent ? 'Message' : 'Request'}</h4>
              {input ? <SchemaTree schema={input} /> : <p className="bz-empty">No payload.</p>}
            </div>
            {!isEvent && (
              <div>
                <h4>Response</h4>
                {output ? <SchemaTree schema={output} /> : <p className="bz-empty">No payload.</p>}
              </div>
            )}
          </div>

          {example !== undefined && (
            <div className="bz-op-example">
              <h4>{isEvent ? 'Example message' : 'Example request'}</h4>
              {/* The service's own example where it supplied one, generated from the schema where it
                  did not — either way it is the document's, not this UI's invention. */}
              <pre>{JSON.stringify(example, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
