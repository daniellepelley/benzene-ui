import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  title?: string;
}

export function Chip({ children, title }: ChipProps) {
  return (
    <span className="bz-chip" title={title}>
      {children}
    </span>
  );
}
