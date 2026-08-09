import type { JsonSchema } from '../contracts';

/**
 * A deterministic example payload from a JSON-schema node.
 *
 * Ported unchanged from mesh-ui.html's `exampleFromSchema`/`exampleString`, and deliberately without
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

/** Depth cap carried over verbatim — a self-referencing schema would otherwise never terminate. */
const MAX_DEPTH = 12;

function exampleString(schema: JsonSchema): string {
  if (typeof schema.format === 'string' && BY_FORMAT[schema.format]) return BY_FORMAT[schema.format]!;
  // A pattern cannot be safely synthesised, so produce nothing rather than something invalid.
  if (schema.pattern) return '';
  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  return min > 0 ? 'x'.repeat(min) : 'string';
}

export function exampleFromSchema(schema: JsonSchema | null | undefined, depth = 0): unknown {
  const s = schema ?? {};
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];

  const type = s.type ?? (s.properties ? 'object' : s.items ? 'array' : 'string');

  if (type === 'object' || s.properties) {
    const out: Record<string, unknown> = {};
    if (depth < MAX_DEPTH) {
      for (const [key, child] of Object.entries(s.properties ?? {})) {
        out[key] = exampleFromSchema(child, depth + 1);
      }
    }
    return out;
  }
  if (type === 'array') {
    const items = Array.isArray(s.items) ? s.items[0] : s.items;
    return depth < MAX_DEPTH && items ? [exampleFromSchema(items, depth + 1)] : [];
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
