import type { JsonSchema } from '../contracts';
import { refName } from '../contracts/contractDocument';

/**
 * A deterministic example payload from a JSON-schema node.
 *
 * Ported from mesh-ui.html's `exampleFromSchema`/`exampleString` — since extended to read a Contract
 * Document's `$ref`s, compositions and nullable wrappers — and deliberately without
 * randomness: the same schema must always produce the same skeleton, so a composed message can be
 * diffed and a test can assert on it. The original comment records the intent — it matches the C#
 * `ExamplePayloadBuilder`.
 *
 * Pure, and therefore testable, which the original was not: it only existed inside the DOM builder.
 */

const BY_FORMAT: Record<string, string> = {
  'date-time': '2020-01-01T00:00:00Z',
  date: '2020-01-01',
  time: '00:00:00',
  uuid: '00000000-0000-0000-0000-000000000000',
  guid: '00000000-0000-0000-0000-000000000000',
  email: 'user@example.com',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '127.0.0.1',
};

/**
 * Depth cap carried over verbatim — a self-referencing schema *object* (not a `$ref`, which the path
 * check cuts) would otherwise never terminate.
 */
const MAX_DEPTH = 12;

function exampleString(schema: JsonSchema): string {
  if (typeof schema.format === 'string' && BY_FORMAT[schema.format]) return BY_FORMAT[schema.format]!;
  // A pattern cannot be safely synthesised, so produce nothing rather than something invalid.
  if (schema.pattern) return '';
  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  return min > 0 ? 'x'.repeat(min) : 'string';
}

/**
 * An example value for `schema`, resolving `$ref`s against `schemas` (a Contract Document's
 * `components.schemas`) when given.
 *
 * - `$ref`: the named component's example. A ref to a component already being built on the current
 *   path — a recursive type — yields the empty value of its type (`{}`, `[]` or `null`) rather than
 *   recursing: a payload that satisfies `A → B → A` with both required is infinite, and the hash
 *   projection cuts a cycle to `{}` for the same reason. An unresolvable ref is `{}`, not a guess.
 * - `allOf`: the members' examples merged when they are objects — so the nullable-reference wrapper
 *   (`{"type":"object","nullable":true,"allOf":[{"$ref":…}]}`) yields the referenced object, and a
 *   composed type yields every member's fields. `oneOf`/`anyOf` take the first alternative.
 * - `nullable`: the non-null value; an example of `null` shows nothing a reader could not guess.
 */
export function exampleFromSchema(
  schema: JsonSchema | null | undefined,
  schemas?: Record<string, JsonSchema> | null,
): unknown {
  return build(schema ?? {}, schemas ?? {}, [], 0);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const emptyOf = (schema: JsonSchema | undefined): unknown =>
  schema?.type === 'array' ? [] : schema?.type === 'object' || schema?.properties || !schema ? {} : null;

function build(s: JsonSchema, schemas: Record<string, JsonSchema>, path: readonly string[], depth: number): unknown {
  if (typeof s.$ref === 'string') {
    const name = refName(s.$ref);
    const target = name === null ? undefined : schemas[name];
    if (!target || name === null) return {};
    if (path.includes(name)) return emptyOf(target);
    return build(target, schemas, [...path, name], depth);
  }
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];

  const composed = [
    ...(Array.isArray(s.allOf) ? s.allOf : []),
    ...(Array.isArray(s.oneOf) && s.oneOf.length > 0 ? [s.oneOf[0]] : []),
    ...(Array.isArray(s.anyOf) && s.anyOf.length > 0 ? [s.anyOf[0]] : []),
  ].filter(isPlainObject) as JsonSchema[];
  if (composed.length > 0) {
    const parts = depth < MAX_DEPTH ? composed.map((m) => build(m, schemas, path, depth + 1)) : [];
    const own = s.properties ? build({ ...s, allOf: undefined, oneOf: undefined, anyOf: undefined }, schemas, path, depth) : undefined;
    const all = own === undefined ? parts : [...parts, own];
    if (all.length > 0 && all.every(isPlainObject)) return Object.assign({}, ...all);
    if (all.length > 0) return all[0];
    return emptyOf(s);
  }

  const type = s.type ?? (s.properties ? 'object' : s.items ? 'array' : 'string');

  if (type === 'object' || s.properties) {
    const out: Record<string, unknown> = {};
    if (depth < MAX_DEPTH) {
      for (const [key, child] of Object.entries(s.properties ?? {})) {
        out[key] = build(child, schemas, path, depth + 1);
      }
    }
    return out;
  }
  if (type === 'array') {
    const items = Array.isArray(s.items) ? s.items[0] : s.items;
    return depth < MAX_DEPTH && items ? [build(items, schemas, path, depth + 1)] : [];
  }
  if (type === 'integer' || type === 'number') {
    if (typeof s.minimum === 'number') return s.minimum;
    if (typeof s.maximum === 'number') return s.maximum;
    return 0;
  }
  if (type === 'boolean') return false;
  if (type === 'null') return null;
  return exampleString(s);
}

/** The inbound body schema: the event message, else the request. A response is not an input. */
export const inboundSchema = (topic: {
  messageSchema?: JsonSchema | null;
  requestSchema?: JsonSchema | null;
}): JsonSchema | null => topic.messageSchema ?? topic.requestSchema ?? null;
