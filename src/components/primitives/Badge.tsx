import type { Rag } from '../../contracts';
import type { ReactNode } from 'react';

export interface BadgeProps {
  children: ReactNode;
  rag?: Rag;
  title?: string;
}

/** A short status word. Takes a RAG only to colour itself — it derives nothing. */
export function Badge({ children, rag, title }: BadgeProps) {
  return (
    <span className="bz-badge" data-rag={rag} title={title}>
      {children}
    </span>
  );
}
