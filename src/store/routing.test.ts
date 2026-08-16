import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from './routing';

/** The shape every parse returns, so a test only has to state what it cares about. */
const route = (over: Partial<ReturnType<typeof parseHash>> = {}) => ({
  page: 'fleet' as const, selected: null, selectedService: null, selectedVersion: null, ...over,
});

describe('hash routing', () => {
  it('round-trips every single-entity page', () => {
    for (const [page, selected] of [
      ['fleet', null],
      ['service', 'orders-api'],
      ['topic', 'orders:create'],
      ['issue', 'abc123'],
    ] as const) {
      expect(parseHash(toHash(page, selected))).toEqual(route({ page, selected }));
    }
  });

  it('encodes topics containing a colon or slash', () => {
    // Topic ids contain colons routinely, and a URL-unsafe id must survive the round trip.
    const hash = toHash('topic', 'orders:created/v2');
    expect(parseHash(hash)).toEqual(route({ page: 'topic', selected: 'orders:created/v2' }));
  });

  it('round-trips a topic at a specific version', () => {
    const hash = toHash('topic', 'payment:capture', null, 'v2');
    expect(parseHash(hash)).toEqual(
      route({ page: 'topic', selected: 'payment:capture', selectedVersion: 'v2' }),
    );
  });

  it('carries no version when none was asked for, so the page can default to the newest', () => {
    // null is "whichever is newest", not "the unversioned one". Emitting a concrete version here
    // would pin every link to whatever happened to be current when it was made.
    expect(toHash('topic', 'payment:capture')).toBe('#topic/payment%3Acapture');
    expect(parseHash('#topic/payment%3Acapture').selectedVersion).toBeNull();
  });

  it('splits on the last @, so a topic id may itself contain one', () => {
    expect(parseHash('#topic/orders%40eu%3Acreate@v3')).toEqual(
      route({ page: 'topic', selected: 'orders@eu:create', selectedVersion: 'v3' }),
    );
  });

  it('treats a trailing @ as no version rather than an empty one', () => {
    // The empty string is a REAL version in this catalogue — the unversioned handler — so it must
    // never be produced by a malformed link.
    expect(parseHash('#topic/orders%3Acreate@')).toEqual(
      route({ page: 'topic', selected: 'orders:create@' }),
    );
  });

  it('does not read an @ in a service id as a version', () => {
    expect(parseHash('#service/orders%40eu')).toEqual(route({ page: 'service', selected: 'orders@eu' }));
  });

  it('treats an empty selection as the fleet, not a broken page', () => {
    expect(parseHash('#service/')).toEqual(route());
  });

  it('falls back to the fleet for anything unrecognised', () => {
    expect(parseHash('#nonsense')).toEqual(route());
    expect(parseHash('')).toEqual(route());
  });

  it('routes the changes ledger', () => {
    expect(toHash('changes', null)).toBe('#changes');
    expect(parseHash('#changes')).toEqual(route({ page: 'changes' }));
  });

  it('never emits a selected hash without a selection', () => {
    expect(toHash('service', null)).toBe('#fleet');
  });

  it('round-trips the test page, service and topic together', () => {
    const hash = toHash('test', 'order:created', 'orders-api');
    expect(hash).toBe('#test/orders-api/order%3Acreated');
    expect(parseHash(hash)).toEqual(
      route({ page: 'test', selected: 'order:created', selectedService: 'orders-api' }),
    );
  });

  it('keeps a half-filled console addressable instead of discarding the reader’s choice', () => {
    // The console is service-first. Sending a service-only selection to the estate threw away a
    // choice the reader had already made, and made the page's own promise that both halves are in
    // the URL false until both were picked.
    expect(toHash('test', null, 'orders-api')).toBe('#test/orders-api');
    expect(parseHash('#test/orders-api')).toEqual(route({ page: 'test', selectedService: 'orders-api' }));
    expect(parseHash('#test/orders-api/')).toEqual(route({ page: 'test', selectedService: 'orders-api' }));
  });

  it('keeps the console addressable even with nothing chosen yet', () => {
    // The Test page rendered at '#fleet', so a reload or a shared link went somewhere else — on the
    // one page whose own copy promises the URL carries its state.
    expect(toHash('test', null, null)).toBe('#test');
    expect(parseHash('#test')).toEqual(route({ page: 'test' }));
    // A topic with no service still has nothing to address: the console is service-first.
    expect(toHash('test', 'order:created', null)).toBe('#test');
    expect(parseHash('#test/')).toEqual(route());
  });
});
