import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

/**
 * The base layer, enforced.
 *
 * This exists because of a real shipped bug: the stylesheet defined tokens and component rules but
 * never styled `html` or `body`. `.bz-app` painted `--bz-bg` inside a 1100px box, so on a dark-mode
 * browser the product was a dark rectangle floating on a browser-default white page, in Times New
 * Roman. Every unit test passed — they asserted on text content, and text content was fine.
 *
 * These are deliberately crude checks on the stylesheet source rather than on rendered output. A
 * jsdom test cannot tell you a page looks wrong; what it can do is refuse to let the foundation go
 * missing again.
 */
/** Every declaration block whose selector list names this element, concatenated. */
const rule = (selector: string): string =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, selectors]) =>
      selectors!.split(',').some((s) => s.trim().split(/[\s:>]/)[0] === selector),
    )
    .map(([, , body]) => body)
    .join('\n');

describe('the base layer', () => {
  it('paints the page itself, not only the app container', () => {
    // Without this the app is a coloured box on whatever the browser defaults to.
    expect(rule('body')).toMatch(/background:/);
    expect(rule('html')).toMatch(/background:/);
  });

  it('sets a foreground colour on the page', () => {
    expect(rule('body')).toMatch(/color:/);
  });

  it('sets a font, so the product is not rendered in the browser default serif', () => {
    expect(rule('body')).toMatch(/font-family:\s*var\(--bz-font\)/);
  });

  it('resets the default body margin', () => {
    expect(rule('body')).toMatch(/margin:\s*0/);
  });

  it('declares color-scheme, so form controls and scrollbars follow the theme', () => {
    expect(rule('html')).toMatch(/color-scheme:/);
  });

  it('gives form controls the page typography', () => {
    // Controls do not inherit font. Unstyled, they render as OS chrome mid-page — which is exactly
    // how the header's buttons and every disclosure caret shipped.
    expect(css).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{[^}]*font:\s*inherit/);
  });

  it('keeps a visible focus ring, having removed the default control appearance', () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
  });
});

describe('the token set', () => {
  const declarations = (block: string) =>
    new Map([...block.matchAll(/(--bz-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));

  /** A value that renders as a colour, whatever notation it is written in. */
  const isColour = (value: string) => /(^|\s)(#[0-9a-f]{3,8}|rgb|hsl|oklch|color-mix)/i.test(value);

  it('redefines every colour token in dark mode', () => {
    // A colour defined only in light mode keeps its light value on a dark background. The failure is
    // silent and looks like one stubbornly wrong element rather than a missing declaration.
    //
    // Derived from the values rather than an exemption list: a hardcoded list of non-colour tokens
    // goes stale the moment one is added, and then either nags about a radius or — worse — quietly
    // stops checking a colour someone spelled differently.
    const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));

    const colours = [...declarations(light)].filter(([, value]) => isColour(value)).map(([name]) => name);
    const inDark = new Set(declarations(dark.slice(0, dark.indexOf('\n}'))).keys());

    expect(colours.filter((name) => !inDark.has(name))).toEqual([]);
  });

  it('checks enough tokens for that to mean something', () => {
    // A parity test over an empty set passes for the wrong reason.
    const light = css.slice(css.indexOf(':root {'), css.indexOf('@media (prefers-color-scheme: dark)'));
    const colours = [...declarations(light)].filter(([, value]) => isColour(value));
    expect(colours.length).toBeGreaterThan(15);
  });

  it('never hardcodes a hex colour outside the token blocks', () => {
    // One hardcoded colour in a component rule is one element that ignores the theme.
    const afterTokens = css.slice(css.indexOf('*, *::before'));
    const hexes = afterTokens.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });
});
