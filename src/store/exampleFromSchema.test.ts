import { describe, it, expect } from 'vitest';
import { exampleFromSchema, inboundSchema } from './exampleFromSchema';

describe('exampleFromSchema', () => {
  it('is deterministic — the same schema always yields the same skeleton', () => {
    // No randomness, so a composed message can be diffed and asserted on.
    const schema = { type: 'object', properties: { a: { type: 'string' }, b: { type: 'integer' } } };
    expect(exampleFromSchema(schema)).toEqual(exampleFromSchema(schema));
  });

  it('prefers example, then default, then the first enum value', () => {
    expect(exampleFromSchema({ type: 'string', example: 'given' })).toBe('given');
    expect(exampleFromSchema({ type: 'string', default: 'fallback' })).toBe('fallback');
    expect(exampleFromSchema({ type: 'string', enum: ['first', 'second'] })).toBe('first');
  });

  it('honours format', () => {
    expect(exampleFromSchema({ type: 'string', format: 'uuid' })).toBe('00000000-0000-0000-0000-000000000000');
    expect(exampleFromSchema({ type: 'string', format: 'email' })).toBe('user@example.com');
    expect(exampleFromSchema({ type: 'string', format: 'date-time' })).toBe('2020-01-01T00:00:00Z');
  });

  it('produces nothing for a pattern rather than something invalid', () => {
    // Synthesising a value that fails the pattern would make the composer suggest a broken message.
    expect(exampleFromSchema({ type: 'string', pattern: '^[A-Z]{3}-\\d+$' })).toBe('');
  });

  it('uses the bound for a constrained number', () => {
    expect(exampleFromSchema({ type: 'integer', minimum: 5 })).toBe(5);
    expect(exampleFromSchema({ type: 'number', maximum: 99 })).toBe(99);
    expect(exampleFromSchema({ type: 'integer' })).toBe(0);
  });

  it('builds nested objects and arrays', () => {
    const value = exampleFromSchema({
      type: 'object',
      properties: {
        lines: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' }, qty: { type: 'integer', minimum: 1 } } } },
      },
    });
    expect(value).toEqual({ lines: [{ sku: 'string', qty: 1 }] });
  });

  it('terminates on a self-referencing schema', () => {
    // A recursive schema would otherwise never bottom out. The depth cap is carried over verbatim.
    const node: Record<string, unknown> = { type: 'object', properties: {} };
    (node.properties as Record<string, unknown>).self = node;
    expect(() => exampleFromSchema(node)).not.toThrow();
  });

  it('meets minLength rather than emitting a too-short string', () => {
    expect(exampleFromSchema({ type: 'string', minLength: 3 })).toBe('xxx');
  });
});

describe('inboundSchema', () => {
  it('prefers the message schema, falls back to the request, and never the response', () => {
    expect(inboundSchema({ messageSchema: { type: 'object' }, requestSchema: { type: 'string' } })).toEqual({ type: 'object' });
    expect(inboundSchema({ requestSchema: { type: 'string' } })).toEqual({ type: 'string' });
    expect(inboundSchema({})).toBeNull();
  });
});
