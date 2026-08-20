import type { ReactNode } from 'react';

export interface KeylineProps {
  /** The definitions this surface's coded terms need, one clause each. */
  children: ReactNode;
}

/**
 * The key at the foot of a card: what the coded terms above it mean, and how to read its numbers.
 *
 * This exists to replace the `title` attribute as a place to put load-bearing text. Eighty-seven of
 * them shipped, carrying things a reader genuinely needed — which source measured a number, that two
 * panels count different windows, what "unobserved" asserts and what it does not. A tooltip is
 * invisible in a screenshot, invisible in print, invisible on a touch device, and invisible to
 * anyone who does not happen to hover the right four words. Load-bearing text cannot live there
 * (mesh-ui-aims.md R6).
 *
 * The alternative to a tooltip is not "put it all in the row" — that is how a card becomes a wall.
 * It is ONE muted line per surface, at the foot, where a reader looks once and then stops needing
 * it. The cost is a line; the tooltip's cost was the information.
 */
export function Keyline({ children }: KeylineProps) {
  return <p className="bz-keyline">{children}</p>;
}
