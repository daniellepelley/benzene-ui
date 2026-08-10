import type { ReactNode } from 'react';

/**
 * What a chip is saying, so fifteen different meanings stop looking identical.
 *
 * A single appearance was carrying payload version, reserved-ness, topic status, schema mismatch,
 * service name, occurrence count, transport, dependency, HTTP route and more — on one row you could
 * get five identical pills of which two were facts, two were warnings and one a classification.
 *
 * `warn`/`bad` are for a *qualifier* on a thing. A finding in its own right — a schema mismatch, a
 * deprecation candidate — is a `Badge`, which is louder and means "this is the point".
 */
export type ChipTone = 'neutral' | 'accent' | 'count' | 'warn' | 'bad';

export interface ChipProps {
  children: ReactNode;
  title?: string;
  tone?: ChipTone;
}

export function Chip({ children, title, tone = 'neutral' }: ChipProps) {
  return (
    <span className="bz-chip" data-tone={tone === 'neutral' ? undefined : tone} title={title}>
      {children}
    </span>
  );
}
