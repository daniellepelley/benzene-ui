import { describe, it, expect } from 'vitest';
import { versionLabel } from './selectors';

describe('version labels', () => {
  it('shows the version exactly as the service declared it', () => {
    // A hardcoded `v` prefix rendered `vv1` for the common case, and adding one conditionally would
    // invent a convention for fleets that version by date or by bare number.
    expect(versionLabel('v1')).toBe('v1');
    expect(versionLabel('2')).toBe('2');
    expect(versionLabel('2026-01')).toBe('2026-01');
  });

  it('treats the empty string as unversioned rather than as a version', () => {
    // An unversioned handler is a real state on the wire, and the empty string is how it arrives.
    expect(versionLabel('')).toBeNull();
    expect(versionLabel(null)).toBeNull();
    expect(versionLabel(undefined)).toBeNull();
  });
});
