import type { JsonSchema } from '../../contracts';
import { EmptyState } from '../primitives/EmptyState';
import { childrenOf, requiredOf, typeOf, facetsOf } from './schemaShape';
import { TRUNCATED_NODE_COPY } from './compatibilityCopy';

/** What happened to one field between two versions, keyed by the change's dotted path. */
export interface SchemaAnnotation {
  kind: string;
  compatibility: string;
  description: string;
  /** True when a type change stopped the walk here, so nothing beneath was compared. */
  truncated?: boolean;
}

export interface SchemaTreeProps {
  schema: JsonSchema | null;
  emptyMessage?: string;
  /**
   * Field-level changes to mark on the contract itself, keyed by full dotted path.
   *
   * This is the point of the section this tree sits in. A change list *beside* a schema makes a
   * reader hold two things in their head and match them up by eye; the same information *on the
   * field* is read rather than reconstructed. It is the difference between "difficult to envisage
   * where the drift is" and simply seeing it.
   */
  annotations?: Map<string, SchemaAnnotation>;
  /** The path prefix these annotations are rooted at, e.g. `orders:create.request`. */
  rootPath?: string;
  /**
   * The previous version's schema. Needed because a REMOVED field is, by definition, not in the
   * schema being rendered — without the baseline, the most consequential class of change would be
   * the one class invisible on the contract.
   */
  baseline?: JsonSchema | null;
}

const MARKER_LABEL: Record<string, string> = {
  propertyAdded: 'added',
  requiredPropertyAdded: 'added, required',
  propertyRemoved: 'removed',
  propertyBecameRequired: 'now required',
  propertyBecameOptional: 'now optional',
  typeChanged: 'type changed',
};

/** The marker on a changed field. Text, not colour alone — colour is never the only signal. */
function ChangeMarker({ annotation }: { annotation: SchemaAnnotation }) {
  return (
    <span
      className="bz-verdict bz-verdict-inline"
      data-verdict={annotation.compatibility}
      title={annotation.description}
    >
      {MARKER_LABEL[annotation.kind] ?? 'changed'}
    </span>
  );
}

/**
 * Names removed at this level: an annotation exactly one segment below `parentPath`, marked
 * `propertyRemoved`, for a field that is (correctly) no longer in the schema being rendered.
 */
function removedAt(
  parentPath: string,
  annotations: Map<string, SchemaAnnotation> | undefined,
  present: Record<string, JsonSchema> | undefined,
): string[] {
  if (!annotations) return [];
  const names: string[] = [];
  for (const [path, annotation] of annotations) {
    if (annotation.kind !== 'propertyRemoved') continue;
    const prefix = parentPath ? `${parentPath}.` : '';
    if (prefix && !path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length);
    if (!name || name.includes('.') || (present && name in present)) continue;
    names.push(name);
  }
  return names;
}

function RemovedNodes({
  parentPath, annotations, present, baseline,
}: {
  parentPath: string;
  annotations?: Map<string, SchemaAnnotation>;
  present?: Record<string, JsonSchema>;
  baseline?: JsonSchema | null;
}) {
  const names = removedAt(parentPath, annotations, present);
  if (names.length === 0 || !annotations) return null;
  const baselineChildren = baseline ? childrenOf(baseline) : undefined;

  return (
    <>
      {names.map((name) => {
        const path = parentPath ? `${parentPath}.${name}` : name;
        const annotation = annotations.get(path)!;
        const was = baselineChildren?.[name];
        return (
          <li key={`removed:${name}`} className="bz-schema-node" data-removed="true">
            <div className="bz-schema-row">
              <span className="bz-schema-name bz-schema-gone">{name}</span>
              {was && (
                <span className="bz-schema-type" title="Type at the previous version">{typeOf(was)}</span>
              )}
              <ChangeMarker annotation={annotation} />
            </div>
          </li>
        );
      })}
    </>
  );
}

interface NodeProps {
  name: string;
  schema: JsonSchema;
  required: boolean;
  path: string;
  annotations?: Map<string, SchemaAnnotation>;
  baseline?: JsonSchema | null;
}

/** One node of the tree. Recursive and pure — depth comes from the data, not from state. */
function SchemaNode({ name, schema, required, path, annotations, baseline }: NodeProps) {
  const annotation = annotations?.get(path);
  const children = childrenOf(schema);
  const childRequired = requiredOf(schema);
  const baselineChildren = baseline ? childrenOf(baseline) : undefined;
  const removed = removedAt(path, annotations, children);
  const facets = facetsOf(schema);

  return (
    <li className="bz-schema-node" data-changed={annotation ? 'true' : undefined}>
      <div className="bz-schema-row">
        {/* Name, then type, then everything else — the Swagger/AsyncAPI reading order. Required is
            attached to the NAME rather than sitting in the row as a fourth chip: it is a property of
            this field being here at all, it is what a reader scans a request body for, and as a chip
            it competed with the type for the same attention at the same weight. */}
        <span className="bz-schema-name">
          {name}
          {required && (
            <abbr className="bz-schema-req" title="Required">*</abbr>
          )}
        </span>
        <span className="bz-schema-type">{typeOf(schema)}</span>
        {facets.length > 0 && (
          <span className="bz-schema-facets">{facets.join(' \u00b7 ')}</span>
        )}
        {annotation && <ChangeMarker annotation={annotation} />}
      </div>
      {/* Already in `JsonSchema` and never rendered — the highest-value readability win available,
          because it is the only thing on the page that says what a field MEANS rather than what
          shape it is. */}
      {schema.description && <p className="bz-schema-desc">{schema.description}</p>}
      {Array.isArray(schema.enum) && schema.enum.length > 0 && (
        <p className="bz-schema-enum">
          <span className="bz-schema-enum-label">one of</span>
          {schema.enum.map((value, i) => (
            <code key={i} className="bz-schema-enum-value">{String(value)}</code>
          ))}
        </p>
      )}
      {annotation?.truncated && <p className="bz-schema-truncated">{TRUNCATED_NODE_COPY}</p>}
      {(children || removed.length > 0) && (
        <ul className="bz-schema-children">
          {Object.entries(children ?? {}).map(([key, child]) => (
            <SchemaNode
              key={key}
              name={key}
              schema={child}
              required={childRequired.has(key)}
              path={`${path}.${key}`}
              annotations={annotations}
              baseline={baselineChildren?.[key]}
            />
          ))}
          <RemovedNodes parentPath={path} annotations={annotations} present={children} baseline={baseline} />
        </ul>
      )}
    </li>
  );
}

export function SchemaTree({
  schema, emptyMessage = 'No schema published for this topic.', annotations, rootPath = '', baseline,
}: SchemaTreeProps) {
  if (!schema) return <EmptyState message={emptyMessage} />;

  const properties = childrenOf(schema);
  if (!properties) {
    return <p className="bz-schema-scalar">{String(schema.type ?? 'any')}</p>;
  }
  const required = requiredOf(schema);
  const baselineChildren = baseline ? childrenOf(baseline) : undefined;

  return (
    <ul className="bz-schema">
      {Object.entries(properties).map(([key, child]) => (
        <SchemaNode
          key={key}
          name={key}
          schema={child}
          required={required.has(key)}
          path={rootPath ? `${rootPath}.${key}` : key}
          annotations={annotations}
          baseline={baselineChildren?.[key]}
        />
      ))}
      <RemovedNodes parentPath={rootPath} annotations={annotations} present={properties} baseline={baseline} />
    </ul>
  );
}
