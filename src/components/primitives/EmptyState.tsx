import { StatusGlyph } from './StatusGlyph';

/**
 * What kind of nothing this is.
 *
 * The distinction is load-bearing for this product's honesty rules, and one dashed box was making
 * all three look identical. "Consumes nothing" and "no usage feed is wired" are opposite statements:
 * one is a fact about the estate, the other an admission about the tooling. A service page carrying
 * six dashed boxes reads as broken when several of them are the desired state.
 */
export type EmptyTone =
  /** There are none, and that is unremarkable. Quiet, inline. */
  | 'quiet'
  /** There are none, and that is good news worth stating. */
  | 'clear'
  /** This cannot be known — no feed wired, or the plane declares it does not supply this. */
  | 'unknown'
  /**
   * Not yet — a fetch is in flight, or the first aggregator run has not happened.
   *
   * Distinct from `unknown` because it resolves on its own and `unknown` does not, and distinct from
   * `quiet` for the reason that matters most: on first paint, before any data lands, a `quiet`
   * empty asserts "there are none" about an estate nobody has looked at yet. That is R1's
   * absent-rendered-as-zero defect displaced in time rather than in space, and it is the one state
   * every surface was missing.
   */
  | 'pending'
  /**
   * The read failed. Not an empty estate — a broken pipe, and the only tone that means somebody has
   * to go and fix something.
   */
  | 'error';

export interface EmptyStateProps {
  message: string;
  tone?: EmptyTone;
  /**
   * A way out, for the empty states a reader can actually act on.
   *
   * A dead end that explains itself is still a dead end: the version-not-found case knows exactly
   * which versions do exist, so leaving the reader to edit the URL by hand would be withholding an
   * answer the page already has.
   */
  action?: { label: string; onClick: () => void };
}

/** Says why there is nothing, rather than showing a blank area. */
export function EmptyState({ message, tone = 'quiet', action }: EmptyStateProps) {
  return (
    <p className="bz-empty" data-tone={tone}>
      {tone === 'clear' && <StatusGlyph rag="green" label="all clear" />}
      {tone === 'error' && <StatusGlyph rag="red" label="could not be read" />}
      {tone === 'error' ? <>could not be read — {message}</> : message}
      {action && (
        <button type="button" className="bz-link" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </p>
  );
}
