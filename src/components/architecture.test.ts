import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The rule, enforced rather than described.
 *
 * "Components hold no state" is worth nothing as a README sentence — the first person in a hurry
 * reaches for useState and nobody notices until the store and the screen disagree. So it is a test.
 */
const componentsDir = join(import.meta.dirname, '.');

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(entry) && !/\.(test|stories)\.tsx?$/.test(entry)) yield path;
  }
}

const files = [...sourceFiles(componentsDir)];
const relative = (f: string) => f.slice(componentsDir.length + 1);

describe('components hold no state', () => {
  it('finds the component files at all (a passing test over an empty set proves nothing)', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(['useState', 'useReducer', 'useRef'])('no component calls %s', (hook) => {
    const offenders = files.filter((f) => new RegExp(`\\b${hook}\\s*[(<]`).test(readFileSync(f, 'utf8')));
    expect(offenders.map(relative)).toEqual([]);
  });

  it('only containers and pages touch the store', () => {
    // Primitives, controls and sections must render from props alone, or they cannot be reused by a
    // team assembling their own UI on their own state.
    const offenders = files
      .filter((f) => /\/(primitives|controls|sections)\//.test(f))
      .filter((f) => /useApp(Selector|Dispatch)|useSelector|useDispatch/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(relative)).toEqual([]);
  });

  it('no component reads the clock — staleness comes from fleet.now', () => {
    // A component calling Date.now() renders differently on every tick and cannot be snapshot-tested.
    const offenders = files.filter((f) => /Date\.now\(\)/.test(readFileSync(f, 'utf8')));
    expect(offenders.map(relative)).toEqual([]);
  });
});

/**
 * THE DATE/AGE RULE: a date is never rendered without its age, and an age never without its date.
 *
 * Half a dozen surfaces printed a raw UTC string and left the reader to subtract — `generated
 * 2026-07-15T09:15:00Z` in the chrome, above a page computing every obligation from it; `first seen
 * … · last seen …` on the issue page; `last observed {iso}` on the edge list. A 2.5-month-stale
 * snapshot rendered identically to a fresh one.
 *
 * Fixing six render sites is what the last three rounds did, and the seventh site reintroduced it
 * each time. So the rule is the test: a timestamp may reach the screen only through `Stamp`, which
 * cannot render a date without its age. A new surface that prints one raw is a build failure rather
 * than a finding in the next round.
 */
describe('every moment is rendered through Stamp', () => {
  /** Timestamp-bearing field names, across the wire contracts and the store's derived shapes. */
  const MOMENTS = [
    'generatedAtUtc', 'generatedAt', 'fetchedAtUtc', 'firstSeen', 'lastSeen', 'lastObservedAt',
    'countsSince', 'windowStartUtc', 'windowEndUtc', 'sentAtUtc', 'lastOkAt', 'lastFailAt',
    'lastActivityAt',
  ];
  const MOMENT = new RegExp(`\\b(?:${MOMENTS.join('|')})\\b`);
  const RENDERED = new RegExp(`(?:\\.\\s*(?:${MOMENTS.join('|')})\\b|^\\s*(?:${MOMENTS.join('|')})\\s*$)`);

  /**
   * Props that may legitimately receive a raw instant: `Stamp`'s own, the two HTML attributes whose
   * job is to carry the machine-readable form beside the rendered one, and a pass-through down to
   * another component that will itself render it through `Stamp`.
   */
  const CARRIERS = /(?:iso|dateTime|title|lastSeen|now|absent)=$/;

  it('no component interpolates a raw timestamp into the DOM', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (!file.endsWith('.tsx')) continue; // only JSX can interpolate into the DOM.
      if (relative(file) === 'primitives/Stamp.tsx') continue; // the one place that may.
      const source = readFileSync(file, 'utf8');

      // Every `{…}` in the file with whatever immediately precedes it. A JSX text interpolation has
      // no preceding `prop=`, which is exactly the shape being banned.
      for (const m of source.matchAll(/(\w+=)?\{([^{}]*)\}/g)) {
        const prop = m[1] ?? '';
        const inner = m[2] ?? '';
        if (!MOMENT.test(inner) || !RENDERED.test(inner)) continue;
        if (prop !== '' && CARRIERS.test(prop)) continue;
        // `{/* … */}` is a JSX comment and an interface body is a type, not a render. Both routinely
        // NAME these fields — the codebase explains itself in prose — and neither reaches the DOM.
        if (/\/\*|\/\//.test(inner)) continue;
        // `{ lastObservedAt: e.lastObservedAt }` is an object literal being built, not rendered.
        if (new RegExp(`(?:${MOMENTS.join('|')})\\s*:`).test(inner)) continue;
        // `const { lastSeen } = x` and `import { … } from` are destructuring, not rendering.
        const after = source.slice(m.index + m[0].length, m.index + m[0].length + 5);
        if (/^\s*(?:=[^=]|from)/.test(after)) continue;
        offenders.push(`${relative(file)}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds the interpolations at all (a passing scan over nothing proves nothing)', () => {
    // The matcher is the load-bearing part of this rule. If it ever stops seeing JSX the rule passes
    // silently for ever, so assert it still finds the legitimate carriers it is meant to skip.
    const carried = files.filter((f) => /iso=\{[^{}]*\}/.test(readFileSync(f, 'utf8')));
    expect(carried.length).toBeGreaterThan(3);
  });
});
