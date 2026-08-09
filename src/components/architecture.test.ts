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
