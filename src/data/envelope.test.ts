import { describe, it, expect } from 'vitest';
import { asWireResponse, parseJson, problemMessage, readProblem, resolvePointer, successOf } from './envelope';

describe('recognising a response envelope', () => {
  it('reads an envelope by its string statusCode', () => {
    const envelope = { statusCode: 'not-found', isSuccessful: false, headers: {}, body: '{}' };
    expect(asWireResponse(envelope)).toBe(envelope);
  });

  it('does not mistake a problem document for an envelope', () => {
    // A route-mapped HTTP error's body is an RFC 9457 document: `status` is an integer there and
    // there is no `statusCode` at all. Reading it as an envelope would invent an outcome.
    expect(asWireResponse({ type: 'about:blank', title: 'Unauthorized', status: 401 })).toBeNull();
  });

  it('refuses a half-shaped envelope rather than coercing it', () => {
    expect(asWireResponse({ statusCode: 200, body: '{}' })).toBeNull();
    expect(asWireResponse({ statusCode: 'ok', isSuccessful: 'true' })).toBeNull();
    expect(asWireResponse({ statusCode: 'ok', body: { inline: true } })).toBeNull();
    expect(asWireResponse({ statusCode: 'ok', headers: ['x'] })).toBeNull();
    expect(asWireResponse(undefined)).toBeNull();
    expect(asWireResponse('ok')).toBeNull();
    expect(asWireResponse([{ statusCode: 'ok' }])).toBeNull();
  });

  it('accepts a null body and absent headers', () => {
    expect(asWireResponse({ statusCode: 'deleted', isSuccessful: true, body: null })).not.toBeNull();
  });
});

describe('the success signal', () => {
  it('is isSuccessful, never the status text', () => {
    // An application-defined status means nothing to a list of words; the flag is the verdict.
    expect(successOf({ statusCode: 'queued-for-review', isSuccessful: true })).toBe(true);
    // And a known success word on a result that says it failed is a failure.
    expect(successOf({ statusCode: 'ok', isSuccessful: false })).toBe(false);
  });

  it('is unknown, not guessed, when the envelope carries none', () => {
    expect(successOf({ statusCode: 'ok' })).toBeNull();
  });
});

describe('the reason a failure gives', () => {
  it('reads a problem document’s detail, then its title', () => {
    expect(problemMessage(JSON.stringify({ title: 'Forbidden', detail: 'Mesh dispatch is off here.' })))
      .toBe('Mesh dispatch is off here.');
    expect(problemMessage(JSON.stringify({ title: 'Forbidden', benzeneStatus: 'forbidden' }))).toBe('Forbidden');
  });

  it('reads a legacy message, a JSON string, and plain text', () => {
    expect(problemMessage(JSON.stringify({ message: 'nope' }))).toBe('nope');
    expect(problemMessage(JSON.stringify('Mesh dispatch is disabled.'))).toBe('Mesh dispatch is disabled.');
    expect(problemMessage('No service named x.')).toBe('No service named x.');
  });

  it('gives none for an empty body or a document with no reason in it', () => {
    expect(problemMessage('')).toBeNull();
    expect(problemMessage(null)).toBeNull();
    expect(problemMessage('{}')).toBeNull();
    expect(problemMessage('[1]')).toBeNull();
  });

  it('parses JSON leniently', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson('<html>')).toBeUndefined();
    expect(parseJson('')).toBeUndefined();
  });
});

describe('reading a problem document', () => {
  it('keeps field and code intact, in order (wire-contracts §1.3, core-concepts §12)', () => {
    const problem = readProblem(JSON.stringify({
      type: 'https://benzene.app/problems/validation-error', title: 'Validation failed',
      detail: 'orderId is required, quantity must be positive', benzeneStatus: 'validation-error',
      errors: [
        { message: 'orderId is required', field: '/orderId', code: 'required' },
        { message: 'quantity must be positive', field: '/items/0/quantity', code: 'GreaterThanValidator' },
      ],
      traceHint: 'an application member, ignored',
    }));
    expect(problem).toEqual({
      benzeneStatus: 'validation-error', title: 'Validation failed',
      detail: 'orderId is required, quantity must be positive',
      errors: [
        { message: 'orderId is required', field: '/orderId', code: 'required' },
        { message: 'quantity must be positive', field: '/items/0/quantity', code: 'GreaterThanValidator' },
      ],
    });
  });

  it('never splits detail into errors when the document carries none', () => {
    expect(readProblem('{"detail":"a, b","benzeneStatus":"bad-request"}'))
      .toEqual({ detail: 'a, b', benzeneStatus: 'bad-request', errors: [] });
  });

  it('drops an entry without a message, and an error with no single location keeps no field', () => {
    expect(readProblem('{"errors":[{"field":"/x"},"legacy string",{"message":"Totals disagree","code":"cross-field"}]}'))
      .toEqual({ errors: [{ message: 'Totals disagree', code: 'cross-field' }] });
  });

  it('is not a problem document when nothing in it is recognisable', () => {
    expect(readProblem('{"orderId":"o-1"}')).toBeNull();
    expect(readProblem('not json')).toBeNull();
    expect(readProblem('')).toBeNull();
  });
});

describe('resolving a field pointer against the body that was sent', () => {
  const body = JSON.stringify({ customer: { 'a/b': 1, 'm~n': 2 }, items: [{ sku: 'X' }], note: null });

  it('finds members, array indexes and escaped tokens (RFC 6901)', () => {
    expect(resolvePointer(body, '/items/0/sku')).toEqual({ found: true, value: 'X' });
    expect(resolvePointer(body, '/customer/a~1b')).toEqual({ found: true, value: 1 });
    expect(resolvePointer(body, '/customer/m~0n')).toEqual({ found: true, value: 2 });
    expect(resolvePointer(body, '/note')).toEqual({ found: true, value: null });
  });

  it('reports a member that is not there as not found, never as null', () => {
    expect(resolvePointer(body, '/orderId')).toEqual({ found: false });
    expect(resolvePointer(body, '/items/1')).toEqual({ found: false });
    expect(resolvePointer(body, '/items/01')).toEqual({ found: false });
    expect(resolvePointer('not json', '/x')).toEqual({ found: false });
  });
});
