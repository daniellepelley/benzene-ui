import { describe, it, expect } from 'vitest';
import { parseHash, toHash } from './routing';

describe('hash routing', () => {
  it('round-trips every single-entity page', () => {
    for (const [page, selected] of [
      ['fleet', null],
      ['service', 'orders-api'],
      ['topic', 'orders:create'],
      ['issue', 'abc123'],
    ] as const) {
      expect(parseHash(toHash(page, selected))).toEqual({ page, selected, selectedService: null });
    }
  });

  it('encodes topics containing a colon or slash', () => {
    // Topic ids contain colons routinely, and a URL-unsafe id must survive the round trip.
    const hash = toHash('topic', 'orders:created/v2');
    expect(parseHash(hash)).toEqual({ page: 'topic', selected: 'orders:created/v2', selectedService: null });
  });

  it('treats an empty selection as the fleet, not a broken page', () => {
    expect(parseHash('#service/')).toEqual({ page: 'fleet', selected: null, selectedService: null });
  });

  it('falls back to the fleet for anything unrecognised', () => {
    expect(parseHash('#nonsense')).toEqual({ page: 'fleet', selected: null, selectedService: null });
    expect(parseHash('')).toEqual({ page: 'fleet', selected: null, selectedService: null });
  });

  it('never emits a selected hash without a selection', () => {
    expect(toHash('service', null)).toBe('#fleet');
  });

  it('round-trips the test page, service and topic together', () => {
    const hash = toHash('test', 'order:created', 'orders-api');
    expect(hash).toBe('#test/orders-api/order%3Acreated');
    expect(parseHash(hash)).toEqual({ page: 'test', selected: 'order:created', selectedService: 'orders-api' });
  });

  it('never emits a test hash missing either half of the pair', () => {
    expect(toHash('test', 'order:created', null)).toBe('#fleet');
    expect(toHash('test', null, 'orders-api')).toBe('#fleet');
  });

  it('treats a test hash missing the topic half as the fleet, not a broken page', () => {
    expect(parseHash('#test/')).toEqual({ page: 'fleet', selected: null, selectedService: null });
    expect(parseHash('#test/orders-api')).toEqual({ page: 'fleet', selected: null, selectedService: null });
    expect(parseHash('#test/orders-api/')).toEqual({ page: 'fleet', selected: null, selectedService: null });
  });
});
