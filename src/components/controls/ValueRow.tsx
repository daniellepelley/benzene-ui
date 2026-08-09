import type { ReactNode } from 'react';

export interface ValueRowProps {
  label: string;
  children: ReactNode;
  title?: string;
}

/** A labelled fact. The workhorse of every detail panel. */
export function ValueRow({ label, children, title }: ValueRowProps) {
  return (
    <div className="bz-value" title={title}>
      <span className="bz-value-label">{label}</span>
      <span className="bz-value-body">{children}</span>
    </div>
  );
}
