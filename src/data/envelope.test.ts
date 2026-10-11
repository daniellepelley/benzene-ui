import { describe, it, expect } from 'vitest';
import { asWireResponse, parseJson, problemMessage, successOf } from './envelope';

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
