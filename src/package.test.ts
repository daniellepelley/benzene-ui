import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const lib = join(import.meta.dirname, '..', 'dist', 'lib');
const built = existsSync(join(lib, 'index.js'));

/**
 * The published package, checked as a package rather than as source.
 *
 * `npm run build:lib` was broken for the whole of this library's life — `tsconfig.lib.json` did not
 * exist, so the `exports` entry point could never be produced. Every other test passed, because
 * every other test imports from `src/`. Nothing had ever imported what a consumer would import.
 *
 * Requires the library build; `npm run test:package` runs both in order.
 */
describe.skipIf(!built)('the published package', () => {
  const index = () => readFileSync(join(lib, 'index.js'), 'utf8');

  it('produces the entry point package.json advertises', () => {
    expect(existsSync(join(lib, 'index.js'))).toBe(true);
    expect(existsSync(join(lib, 'index.d.ts'))).toBe(true);
  });

  it('ships the stylesheet as a separate file, not injected', () => {
    // A library that injects a stylesheet on import cannot be rendered server-side and cannot be
    // overridden by a consumer's cascade order.
    expect(existsSync(join(lib, 'theme.css'))).toBe(true);
    expect(index()).not.toMatch(/document\.createElement\(["']style["']\)/);
  });

  it('leaves React and Redux to the consumer', () => {
    // Bundling them gives a consumer two copies of React: hooks throw, and context stops matching
    // across the boundary. They must appear as imports, never as inlined source.
    for (const dep of ['react', 'react/jsx-runtime', 'react-redux', '@reduxjs/toolkit']) {
      expect(index(), `${dep} should be imported, not bundled`).toMatch(
        new RegExp(`from\\s*["']${dep.replace('/', '\\/')}["']`),
      );
    }
    // A telltale of a bundled React rather than an imported one.
    expect(index()).not.toMatch(/__SECRET_INTERNALS_DO_NOT_USE/);
  });

  it('exports the things the README tells people to import', () => {
    const source = index();
    for (const name of ['ServiceCard', 'StatusGlyph', 'ragForStatus', 'createStore', 'TopicList']) {
      expect(source, `${name} should be exported`).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });

  it('declares types for the store, not just for the components', () => {
    // A component library whose store types are missing forces every consumer to re-derive
    // RootState, which is the exact mistake this codebase already made once by hand.
    const types = readFileSync(join(lib, 'store', 'store.d.ts'), 'utf8');
    expect(types).toMatch(/RootState/);
    expect(types).toMatch(/AppDispatch/);
  });
});

describe('the package manifest', () => {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
  ) as Record<string, never>;

  it('points its entry points at files the build actually produces', () => {
    const exports = pkg.exports as unknown as Record<string, { types?: string; default?: string } | string>;
    const main = (exports['.'] ?? {}) as { types?: string; default?: string };
    expect(main.default).toBe('./dist/lib/index.js');
    expect(main.types).toBe('./dist/lib/index.d.ts');
    expect(exports['./theme.css']).toBe('./dist/lib/theme.css');
  });

  it('declares React and Redux as peers, never as dependencies', () => {
    expect(pkg.peerDependencies).toMatchObject({ react: expect.any(String), 'react-redux': expect.any(String) });
    expect(pkg.dependencies).toBeUndefined();
  });

  it('marks CSS as the only side effect, so the rest tree-shakes', () => {
    expect(pkg.sideEffects).toEqual(['**/*.css']);
  });
});
