import type { JsonSchema } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { EmptyState } from '../primitives/EmptyState';
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

const isObject = (v: unknown): v is JsonSchema =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const childrenOf = (schema: JsonSchema): Record<string, JsonSchema> | undefined =>
  schema.properties ?? (isObject(schema.items) ? schema.items.properties : undefined);

const requiredOf = (schema: JsonSchema) =>
  new Set((schema.required ?? (isObject(schema.items) ? schema.items.required : undefined)) ?? []);

const typeOf = (schema: JsonSchema) =>
  Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'any');

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
      className="bz-schema-mark"
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
            <span className="bz-schema-name bz-schema-gone">{name}</span>
            {was && <Chip title="Type at the previous version">{typeOf(was)}</Chip>}
            {was?.format && <Chip title="Format at the previous version">{was.format}</Chip>}
            <ChangeMarker annotation={annotation} />
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

  return (
    <li className="bz-schema-node" data-changed={annotation ? 'true' : undefined}>
      <span className="bz-schema-name">{name}</span>
      <Chip title="Type">{typeOf(schema)}</Chip>
      {schema.format && <Chip title="Format">{schema.format}</Chip>}
      {required && <Chip title="Required">required</Chip>}
      {Array.isArray(schema.enum) && <Chip title="Allowed values">{schema.enum.join(' | ')}</Chip>}
      {annotation && <ChangeMarker annotation={annotation} />}
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
