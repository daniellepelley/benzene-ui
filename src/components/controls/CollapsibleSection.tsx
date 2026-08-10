import type { ReactNode } from 'react';

export interface CollapsibleSectionProps {
  /** Stable id — this is what a store remembers, so it must not be the display title. */
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string) => void;
  /** Shown beside the title whether the body is open or not. */
  note?: ReactNode;
  children: ReactNode;
}

/**
 * A section a reader can put away.
 *
 * Hides the body, never the header — so nothing becomes undiscoverable, it just stops competing for
 * the top of the page. That is why this is a collapse and not a tab: a reader who does not know the
 * topology view exists will never click a tab for it, but they will read a heading.
 *
 * Takes `open` as a prop rather than reading a store, like every other control here. Whether a
 * section is open is view state, and a team assembling their own mesh UI keeps it in their own.
 */
export function CollapsibleSection({ id, title, open, onToggle, note, children }: CollapsibleSectionProps) {
  return (
    <section data-section={id}>
      <div className="bz-section-head">
        <h2>{title}</h2>
        {note && <span className="bz-page-note">{note}</span>}
        <button
          type="button"
          className="bz-section-toggle"
          aria-expanded={open}
          onClick={() => onToggle(id)}
        >
          {open ? 'hide' : 'show'}
        </button>
      </div>
      {open && children}
    </section>
  );
}
