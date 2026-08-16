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
  /** This cannot be known — no feed, not supplied, not yet fetched. The dashed box means *this*. */
  | 'unknown';

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
      {message}
      {action && (
        <button type="button" className="bz-link" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </p>
  );
}
