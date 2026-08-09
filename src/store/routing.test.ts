import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from './routing';

describe('hash routing', () => {
  it('round-trips every page', () => {
    for (const [page, selected] of [
      ['fleet', null],
      ['service', 'orders-api'],
      ['topic', 'orders:create'],
      ['issue', 'abc123'],
    ] as const) {
      expect(parseHash(toHash(page, selected))).toEqual({ page, selected });
    }
  });

  it('encodes topics containing a colon or slash', () => {
    // Topic ids contain colons routinely, and a URL-unsafe id must survive the round trip.
    const hash = toHash('topic', 'orders:created/v2');
    expect(parseHash(hash)).toEqual({ page: 'topic', selected: 'orders:created/v2' });
  });

  it('treats an empty selection as the fleet, not a broken page', () => {
    expect(parseHash('#service/')).toEqual({ page: 'fleet', selected: null });
  });

  it('falls back to the fleet for anything unrecognised', () => {
    expect(parseHash('#nonsense')).toEqual({ page: 'fleet', selected: null });
    expect(parseHash('')).toEqual({ page: 'fleet', selected: null });
  });

  it('never emits a selected hash without a selection', () => {
    expect(toHash('service', null)).toBe('#fleet');
  });
});
