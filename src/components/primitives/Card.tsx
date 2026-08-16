import type { ReactNode } from 'react';

export interface CardProps {
  title: string;
  children: ReactNode;
  /** Optional controls that belong to this card, rendered on the title row. */
  actions?: ReactNode;
  /** A short clause under the title — a window, a caveat, a provenance note. */
  note?: string;
}

/**
 * A bounded group of related facts.
 *
 * The design language for this already existed — the estate page's service cards and stat tiles use
 * the same surface, border, radius and shadow tokens — it had simply never been applied to the
 * detail pages, which rendered eight sibling `<section>`s with bare headings and no grouping. The
 * cost was not aesthetic: with every heading at the same weight, readers took a *produced topic* for
 * an outbound *call*, and the line that decides whether a release ships rendered in the same
 * typographic weight as the snapshot timestamp directly above it.
 *
 * The heading contract that goes with it: a card's title is an `h3`, and anything subdividing the
 * card is an `h4`. That is what turns six peer headings into two groups of two.
 */
export function Card({ title, children, actions, note }: CardProps) {
  return (
    <section className="bz-card">
      <div className="bz-card-head">
        <h3>{title}</h3>
        {note && <span className="bz-card-note">{note}</span>}
        {actions && <div className="bz-card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
