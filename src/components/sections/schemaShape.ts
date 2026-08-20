import type { JsonSchema } from '../../contracts';

/**
 * How a JSON Schema's shape is read, in one place.
 *
 * Extracted from `SchemaTree` when a second renderer needed the same answers: the agreement view
 * walks the union of several services' declarations, and two walkers disagreeing about what "the
 * children of this node" or "the type of this node" means would produce two different pictures of
 * one contract — which is the failure the agreement view exists to end, reproduced inside the tool.
 */
export const isObject = (v: unknown): v is JsonSchema =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const childrenOf = (schema: JsonSchema): Record<string, JsonSchema> | undefined =>
  schema.properties ?? (isObject(schema.items) ? schema.items.properties : undefined);

export const requiredOf = (schema: JsonSchema) =>
  new Set((schema.required ?? (isObject(schema.items) ? schema.items.required : undefined)) ?? []);

export const typeOf = (schema: JsonSchema): string => {
  const base = Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'any');
  // `array` alone tells a reader nothing they cannot see from the indentation. Swagger and the
  // AsyncAPI viewer both fold the item type into the type itself, so one glance answers "a list of
  // what?" — which is the question the bare word raises and does not answer.
  if (base === 'array' && isObject(schema.items)) return `array[${typeOf(schema.items)}]`;
  return base;
};

/**
 * The constraints a schema states about a value, as short verbal facets.
 *
 * These are all in `JsonSchema` and were all being dropped: `pattern`, `minimum`, `maximum`,
 * `minLength` and `maxLength` never reached the screen, while the usage feed counted validation
 * errors on exactly the topics that declare them. A reader debugging a rejected payload had to open
 * the service's own spec to discover the field was capped at 12 characters.
 *
 * Rendered as text rather than as chips deliberately. The tree previously gave type, format,
 * required and enum four identical chips, so four different kinds of fact competed at one weight —
 * the "fifteen meanings, one look" failure. Facets are subordinate to the name and the type, and
 * they now look subordinate.
 */
export const facetsOf = (schema: JsonSchema): string[] => {
  const facets: string[] = [];
  if (schema.format) facets.push(schema.format);
  if (typeof schema.minLength === 'number' && typeof schema.maxLength === 'number') {
    facets.push(`${schema.minLength}\u2013${schema.maxLength} chars`);
  } else if (typeof schema.maxLength === 'number') {
    facets.push(`\u2264 ${schema.maxLength} chars`);
  } else if (typeof schema.minLength === 'number') {
    facets.push(`\u2265 ${schema.minLength} chars`);
  }
  if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number') {
    facets.push(`${schema.minimum}\u2013${schema.maximum}`);
  } else if (typeof schema.minimum === 'number') {
    facets.push(`\u2265 ${schema.minimum}`);
  } else if (typeof schema.maximum === 'number') {
    facets.push(`\u2264 ${schema.maximum}`);
  }
  if (typeof schema.pattern === 'string') facets.push(`matches /${schema.pattern}/`);
  return facets;
};

