import type { JsonSchema } from '../../contracts';
import { Chip } from '../primitives/Chip';
import { EmptyState } from '../primitives/EmptyState';

export interface SchemaTreeProps {
  schema: JsonSchema | null;
  emptyMessage?: string;
}

/** One node of the tree. Recursive and pure — depth comes from the data, not from state. */
function SchemaNode({ name, schema, required }: { name: string; schema: JsonSchema; required: boolean }) {
  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'any');
  const children = schema.properties ?? (isObject(schema.items) ? schema.items.properties : undefined);
  const childRequired = new Set(
    (schema.required ?? (isObject(schema.items) ? schema.items.required : undefined)) ?? [],
  );

  return (
    <li className="bz-schema-node">
      <span className="bz-schema-name">{name}</span>
      <Chip title="Type">{type}</Chip>
      {schema.format && <Chip title="Format">{schema.format}</Chip>}
      {required && <Chip title="Required">required</Chip>}
      {Array.isArray(schema.enum) && <Chip title="Allowed values">{schema.enum.join(' | ')}</Chip>}
      {children && (
        <ul className="bz-schema-children">
          {Object.entries(children).map(([key, child]) => (
            <SchemaNode key={key} name={key} schema={child} required={childRequired.has(key)} />
          ))}
        </ul>
      )}
    </li>
  );
}

const isObject = (v: unknown): v is JsonSchema => typeof v === 'object' && v !== null && !Array.isArray(v);

export function SchemaTree({ schema, emptyMessage = 'No schema published for this topic.' }: SchemaTreeProps) {
  if (!schema) return <EmptyState message={emptyMessage} />;

  const properties = schema.properties ?? (isObject(schema.items) ? schema.items.properties : undefined);
  if (!properties) {
    return <p className="bz-schema-scalar">{String(schema.type ?? 'any')}</p>;
  }
  const required = new Set(schema.required ?? (isObject(schema.items) ? schema.items.required : []) ?? []);

  return (
    <ul className="bz-schema">
      {Object.entries(properties).map(([key, child]) => (
        <SchemaNode key={key} name={key} schema={child} required={required.has(key)} />
      ))}
    </ul>
  );
}
