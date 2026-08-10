import type { ReactNode } from 'react';

export interface PageHeadProps {
  /** Where this page sits. Without it a reader who followed a link is simply nowhere. */
  breadcrumb?: { label: string; onClick: () => void }[];
  title: string;
  /** One line on what this page answers. Below the title, never on its baseline. */
  lede?: ReactNode;
  /** Status marks, versions — the things read before the title is finished. */
  badges?: ReactNode;
  /** Actions, right-aligned. */
  actions?: ReactNode;
  /** Entity names are identifiers; monospace makes them scannable and copyable. */
  mono?: boolean;
}

/**
 * The head of a drill-in page.
 *
 * Three things the port had lost. A **breadcrumb**, because the nav marks no page as current once
 * you leave the estate, so a reader arriving on a service page has no idea where they are or how
 * they got there. A **title with room** — the previous head was a flex row with `align-items:
 * center`, so an explanatory sentence ended up on the same baseline as the heading, which on the
 * Value page meant the honesty caveat about whether a usage feed is wired read as a subtitle. And a
 * **lede**, so each page says what question it answers rather than assuming the reader knows.
 */
export function PageHead({ breadcrumb, title, lede, badges, actions, mono }: PageHeadProps) {
  return (
    <header className="bz-page-head" data-mono={mono ? 'true' : undefined}>
      <div className="bz-page-head-main">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="bz-crumbs" aria-label="Breadcrumb">
            {breadcrumb.map((crumb) => (
              <button type="button" key={crumb.label} className="bz-crumb" onClick={crumb.onClick}>
                {crumb.label}
              </button>
            ))}
          </nav>
        )}
        <div className="bz-page-title">
          <h1>{title}</h1>
          {badges}
        </div>
        {lede && <p className="bz-page-lede">{lede}</p>}
      </div>
      {actions && <div className="bz-page-actions">{actions}</div>}
    </header>
  );
}
