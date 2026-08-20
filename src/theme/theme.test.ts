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

  it('keeps the OS dark block and the forced dark block identical', () => {
    // Dark is declared twice — once behind `prefers-color-scheme` and once behind `data-theme` — so
    // a reader can force a theme against their OS. CSS cannot name a block of declarations, so the
    // duplication is real and the only defence against it drifting is this. Half-dark is worse than
    // either theme: the reader sees one stubbornly wrong panel and blames the data.
    const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    const fromOs = declarations(media.slice(0, media.indexOf('\n}')));
    const forced = declarations(
      css.slice(css.indexOf(":root[data-theme='dark'] {")).split('\n}')[0]!,
    );

    expect(Object.fromEntries(forced)).toEqual(Object.fromEntries(fromOs));
  });

  it('sets color-scheme for a forced theme, not only for the OS one', () => {
    // Native controls and scrollbars ignore the tokens. Without this a forced dark page has white
    // dropdowns and a white scrollbar — the same class of bug as the missing body background.
    expect(css).toMatch(/:root\[data-theme='dark'\]\s*\{[^}]*color-scheme:\s*dark/);
    expect(css).toMatch(/:root\[data-theme='light'\]\s*\{[^}]*color-scheme:\s*light/);
  });

  it('never hardcodes a hex colour outside the token blocks', () => {
    // One hardcoded colour in a component rule is one element that ignores the theme.
    const afterTokens = css.slice(css.indexOf('*, *::before'));
    const hexes = afterTokens.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });
});

/**
 * CONTRAST, MEASURED.
 *
 * A design-system rule nobody can check is a preference. The light theme shipped with all three RAG
 * text colours below WCAG AA on their own tinted backgrounds — red 3.63:1, amber 2.95:1, green
 * 3.18:1 — on the badges that carry this product's verdicts, at 10.5px. Nobody noticed because
 * nothing measured it.
 */
describe('RAG colours clear WCAG AA on their own backgrounds', () => {
  const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

  /** First definition wins here: `:root` is the light theme, and the dark overrides come later. */
  const token = (name: string) => {
    const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!match) throw new Error(`token ${name} not found`);
    return match[1]!;
  };

  const relativeLuminance = (hex: string) => {
    const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = parts.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };

  const contrast = (a: string, b: string) => {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it.each(['red', 'amber', 'green'])('%s text on its own tint clears 4.5:1', (rag) => {
    expect(contrast(token(`--bz-rag-${rag}`), token(`--bz-rag-${rag}-bg`))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['red', 'amber', 'green'])('%s text on the page and on a card clears 4.5:1', (rag) => {
    for (const surface of ['--bz-bg', '--bz-surface']) {
      expect(contrast(token(`--bz-rag-${rag}`), token(surface))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * THE VISUAL SYSTEM, ENFORCED.
 *
 * Both of these were found by audit rather than by anything in the build: 27 distinct font sizes in
 * three units with invisible near-duplicates (11px vs 11.5px vs 0.72rem), and six class families
 * defined twice with different values where the later block silently won. Neither is the kind of
 * thing a reviewer catches by reading a diff, and both make every later change more expensive.
 */
describe('the stylesheet does not fight itself', () => {
  const sheet = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8');

  it('defines each class family exactly once', () => {
    const selectors = [...sheet.matchAll(/^(\.[a-z0-9-]+(?:,\s*\.[a-z0-9-]+)*)\s*\{/gm)]
      .map((m) => m[1]!.trim());
    const counts = new Map<string, number>();
    for (const selector of selectors) counts.set(selector, (counts.get(selector) ?? 0) + 1);
    const duplicated = [...counts].filter(([, n]) => n > 1).map(([s]) => s);
    expect(duplicated, 'a second definition silently overrides the first').toEqual([]);
  });

  it('sizes type from the scale rather than by hand', () => {
    // `inherit` and one `em` (a sort marker that scales with its header) are the only exemptions.
    const body = sheet.slice(sheet.indexOf('--bz-fs-num'));
    const raw = [...body.matchAll(/font-size:\s*([^;]+);/g)]
      .map((m) => m[1]!.trim())
      .filter((v) => !v.startsWith('var(') && v !== 'inherit' && !v.endsWith('em'));
    expect(raw, 'add a step to the scale rather than a new one-off size').toEqual([]);
  });
});
